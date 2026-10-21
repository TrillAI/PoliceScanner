"""Cut a continuous audio stream into radio transmissions.

Radio traffic is push-to-talk: each transmission starts with speech and ends
with a short pause. The segmenter buffers audio, finds speech with a VAD, and
emits a transmission once it has been followed by enough silence. This avoids
cutting words in half at fixed-length boundaries, which is a major source of
errors when chunked transcription is used on radio audio.
"""

from dataclasses import dataclass
from typing import Callable, List, Tuple

import numpy as np

SAMPLE_RATE = 16000
PAD_S = 0.2  # context kept around each transmission so the first/last word is not clipped
KEEP_TAIL_S = 0.5  # silence retained while waiting for speech to start

SpeechSpans = Callable[[np.ndarray], List[Tuple[int, int]]]


@dataclass(frozen=True)
class Utterance:
    start_s: float  # position in the stream, seconds since the worker started
    end_s: float
    audio: np.ndarray  # mono float32, 16 kHz


def silero_speech_spans(audio: np.ndarray) -> List[Tuple[int, int]]:
    """Speech spans in samples, using the Silero VAD bundled with faster-whisper."""
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    opts = VadOptions(
        threshold=0.5,
        min_speech_duration_ms=150,
        min_silence_duration_ms=100,
        speech_pad_ms=0,
    )
    return [(d["start"], d["end"]) for d in get_speech_timestamps(audio, opts, sampling_rate=SAMPLE_RATE)]


class UtteranceSegmenter:
    def __init__(
        self,
        speech_spans: SpeechSpans = silero_speech_spans,
        silence_ms: int = 600,
        max_utterance_s: float = 25.0,
        min_utterance_s: float = 0.3,
    ):
        self._spans = speech_spans
        self._silence = int(SAMPLE_RATE * silence_ms / 1000)
        self._max = int(SAMPLE_RATE * max_utterance_s)
        self._min = int(SAMPLE_RATE * min_utterance_s)
        self._pad = int(SAMPLE_RATE * PAD_S)
        self._keep_tail = int(SAMPLE_RATE * KEEP_TAIL_S)
        self._buf = np.zeros(0, dtype=np.float32)
        self._offset = 0  # absolute sample index of self._buf[0]

    def push(self, chunk: np.ndarray) -> List[Utterance]:
        if chunk.size:
            self._buf = np.concatenate([self._buf, chunk.astype(np.float32, copy=False)])
        return self._process(final=False)

    def flush(self) -> List[Utterance]:
        """Emit whatever speech is still buffered, e.g. when the stream ends."""
        return self._process(final=True)

    # -- internals -------------------------------------------------------

    def _groups(self, spans: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
        """Merge spans separated by less than the silence threshold into transmissions."""
        groups: List[Tuple[int, int]] = []
        for start, end in spans:
            if groups and start - groups[-1][1] < self._silence:
                groups[-1] = (groups[-1][0], end)
            else:
                groups.append((start, end))
        return groups

    def _process(self, final: bool) -> List[Utterance]:
        buf = self._buf
        n = len(buf)
        if n == 0:
            return []

        groups = self._groups(self._spans(buf)) if n >= self._min else []
        out: List[Utterance] = []

        if not groups:
            cut = max(0, n - self._keep_tail)
            self._advance(cut)
            return []

        last_start, last_end = groups[-1]
        last_complete = final or (n - last_end) >= self._silence

        complete = groups if last_complete else groups[:-1]
        cut = 0
        for start, end in complete:
            if end - start >= self._min:
                out.append(self._make(start, end))
            cut = min(n, end + self._pad)

        if not last_complete:
            # Still in progress. Force a cut if it has run past the maximum length,
            # so one long transmission cannot grow the buffer without bound.
            if n - last_start >= self._max:
                if n - last_start >= self._min:
                    out.append(self._make(last_start, n))
                cut = n
            else:
                cut = max(cut, max(0, last_start - self._pad))

        self._advance(cut)
        return out

    def _make(self, start: int, end: int) -> Utterance:
        s = max(0, start - self._pad)
        e = min(len(self._buf), end + self._pad)
        return Utterance(
            start_s=(self._offset + s) / SAMPLE_RATE,
            end_s=(self._offset + e) / SAMPLE_RATE,
            audio=self._buf[s:e].copy(),
        )

    def _advance(self, cut: int) -> None:
        cut = max(0, min(cut, len(self._buf)))
        if cut:
            self._buf = self._buf[cut:]
            self._offset += cut
