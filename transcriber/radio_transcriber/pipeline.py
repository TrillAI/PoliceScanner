"""Per-feed transcription workers and the in-memory transcript store."""

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional

from . import audio
from .config import Feed, Settings
from .engine import SpeechEngine
from .filters import confidence_from_logprob, judge
from .normalize import normalize_radio_transcript
from .segmenter import UtteranceSegmenter

log = logging.getLogger("radio_transcriber")

RECONNECT_MIN_S = 2.0
RECONNECT_MAX_S = 60.0


@dataclass(frozen=True)
class TranscriptRecord:
    seq: int
    feed_id: str
    started_at: float  # unix seconds, estimated from the stream clock
    duration_s: float
    text: str
    normalized: str
    confidence: float


@dataclass
class FeedStatus:
    state: str = "starting"  # starting | streaming | reconnecting | stopped
    last_segment_at: Optional[float] = None
    last_error: Optional[str] = None
    dropped: Dict[str, int] = field(default_factory=dict)


class TranscriptStore:
    """Thread-safe, bounded history of transcript records per feed."""

    def __init__(self, history_size: int = 500):
        self._lock = threading.Lock()
        self._history_size = history_size
        self._records: Dict[str, Deque[TranscriptRecord]] = {}
        self._seq: Dict[str, int] = {}

    def add(self, feed_id: str, **fields) -> TranscriptRecord:
        with self._lock:
            seq = self._seq.get(feed_id, 0) + 1
            self._seq[feed_id] = seq
            record = TranscriptRecord(seq=seq, feed_id=feed_id, **fields)
            bucket = self._records.setdefault(feed_id, deque(maxlen=self._history_size))
            bucket.append(record)
            return record

    def latest_seq(self, feed_id: str) -> int:
        with self._lock:
            return self._seq.get(feed_id, 0)

    def after(self, feed_id: str, seq: int, limit: int = 200) -> List[TranscriptRecord]:
        with self._lock:
            bucket = self._records.get(feed_id, deque())
            items = [r for r in bucket if r.seq > seq]
        return items[:limit]


class FeedWorker(threading.Thread):
    def __init__(
        self,
        feed: Feed,
        settings: Settings,
        engine: SpeechEngine,
        engine_lock: threading.Lock,
        store: TranscriptStore,
        status: FeedStatus,
        segmenter_factory=None,
    ):
        super().__init__(name=f"feed-{feed.id}", daemon=True)
        self.feed = feed
        self._settings = settings
        self._engine = engine
        self._engine_lock = engine_lock
        self._store = store
        self.status = status
        self._stop_event = threading.Event()
        self._proc = None
        self._segmenter_factory = segmenter_factory or (
            lambda: UtteranceSegmenter(
                silence_ms=settings.silence_ms,
                max_utterance_s=settings.max_utterance_s,
                min_utterance_s=settings.min_utterance_s,
            )
        )

    def stop(self) -> None:
        self._stop_event.set()
        proc = self._proc
        if proc and proc.poll() is None:
            proc.kill()

    def run(self) -> None:
        backoff = RECONNECT_MIN_S
        while not self._stop_event.is_set():
            started = time.time()
            try:
                self._run_once()
                error = "stream ended"
            except Exception as exc:  # keep the worker alive across decode failures
                error = f"{type(exc).__name__}: {exc}"
            if self._stop_event.is_set():
                break
            self.status.state = "reconnecting"
            self.status.last_error = error
            log.warning("feed %s: %s; retrying in %.0fs", self.feed.id, error, backoff)
            self._stop_event.wait(backoff)
            # Reset the backoff after a stream that ran for a while.
            backoff = RECONNECT_MIN_S if time.time() - started > 60 else min(backoff * 2, RECONNECT_MAX_S)
        self.status.state = "stopped"

    def _run_once(self) -> None:
        self._proc = audio.start_decoder(
            self._settings.ffmpeg_bin, self.feed.url, self._settings.radio_filter
        )
        self.status.state = "streaming"
        segmenter = self._segmenter_factory()
        stream_started_wall = time.time()
        try:
            for chunk in audio.iter_chunks(self._proc):
                if self._stop_event.is_set():
                    return
                for utt in segmenter.push(chunk):
                    self._handle(utt, stream_started_wall)
            for utt in segmenter.flush():
                self._handle(utt, stream_started_wall)
        finally:
            if self._proc.poll() is None:
                self._proc.kill()
            self._proc.wait()
            # ffmpeg writes its error text to stderr; surface it for the status page.
            err = self._proc.stderr.read().decode("utf-8", "replace").strip()
            self._proc.stderr.close()
            if err:
                self.status.last_error = err.splitlines()[-1][:300]
            self._proc = None

    def _handle(self, utt, stream_started_wall: float) -> None:
        pcm = audio.normalize_peak(utt.audio) if self._settings.peak_normalize else utt.audio
        with self._engine_lock:
            hyp = self._engine.transcribe(pcm)
        reason = judge(hyp, self._settings.filters)
        if reason is not None:
            self.status.dropped[reason] = self.status.dropped.get(reason, 0) + 1
            return
        text = hyp.text.strip()
        now = time.time()
        self._store.add(
            self.feed.id,
            started_at=stream_started_wall + utt.start_s,
            duration_s=round(utt.end_s - utt.start_s, 2),
            text=text,
            normalized=normalize_radio_transcript(text),
            confidence=round(confidence_from_logprob(hyp.avg_logprob), 3),
        )
        self.status.last_segment_at = now
