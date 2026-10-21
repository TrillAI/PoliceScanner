import os
import subprocess
import tempfile
import time
import threading
import unittest

import numpy as np

from radio_transcriber.config import Feed, Settings
from radio_transcriber.filters import FilterSettings, Hypothesis
from radio_transcriber.pipeline import FeedStatus, FeedWorker, TranscriptStore
from radio_transcriber.segmenter import UtteranceSegmenter
from radio_transcriber.config import _default_ffmpeg


def energy_spans(buf, frame=480, threshold=0.02, min_frames=3):
    """Energy VAD stand-in for Silero: marks 30 ms frames above an RMS threshold."""
    n = len(buf) // frame
    if n == 0:
        return []
    rms = np.sqrt((buf[: n * frame].reshape(n, frame) ** 2).mean(axis=1))
    voiced = rms > threshold
    spans, start = [], None
    for i, v in enumerate(voiced):
        if v and start is None:
            start = i
        if not v and start is not None:
            if i - start >= min_frames:
                spans.append((start * frame, i * frame))
            start = None
    if start is not None and n - start >= min_frames:
        spans.append((start * frame, n * frame))
    return spans


class StubEngine:
    def __init__(self, texts):
        self._texts = list(texts)

    def transcribe(self, audio):
        text = self._texts.pop(0) if self._texts else "Unit 4 copy 10-4"
        return Hypothesis(text=text, avg_logprob=-0.2, no_speech_prob=0.01, compression_ratio=1.1)


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ffmpeg = _default_ffmpeg()
        cls.tmp = tempfile.mkdtemp()
        cls.src = os.path.join(cls.tmp, "traffic.wav")
        # Two 1.2 s tone bursts separated by 2 s of silence, then trailing silence.
        filt = (
            "aevalsrc='if(lt(mod(t,4),1.2),0.3*sin(2*PI*440*t),0)':s=16000:d=6,"
            "aformat=sample_fmts=s16:channel_layouts=mono"
        )
        subprocess.run(
            [cls.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-filter_complex", filt, cls.src],
            check=True,
        )

    def test_file_flows_through_decode_segment_filter_store(self):
        feed = Feed(id="test", url=self.src)
        settings = Settings(
            feeds=[feed],
            ffmpeg_bin=self.ffmpeg,
            silence_ms=600,
            max_utterance_s=25,
            min_utterance_s=0.5,
            filters=FilterSettings(),
        )
        store = TranscriptStore(50)
        status = FeedStatus()
        worker = FeedWorker(
            feed,
            settings,
            StubEngine(["Unit 4 copy 10-4", "Shots fired at Broadway"]),
            threading.Lock(),
            store,
            status,
            segmenter_factory=lambda: UtteranceSegmenter(
                speech_spans=energy_spans, silence_ms=600, max_utterance_s=25, min_utterance_s=0.5
            ),
        )
        worker.start()
        deadline = time.time() + 60
        while time.time() < deadline and len(store.after("test", 0)) < 2:
            time.sleep(0.1)
        worker.stop()
        worker.join(timeout=10)

        records = store.after("test", 0)
        self.assertEqual([r.text for r in records], ["Unit 4 copy 10-4", "Shots fired at Broadway"])
        self.assertEqual(records[0].normalized, "unit 4 copy 10-4")
        self.assertTrue(all(0.9 < r.duration_s < 2.0 for r in records), [r.duration_s for r in records])
        self.assertLess(records[0].started_at, records[1].started_at)
        self.assertIsNotNone(status.last_segment_at)

    def test_hallucinated_output_is_dropped_not_stored(self):
        feed = Feed(id="test", url=self.src)
        settings = Settings(feeds=[feed], ffmpeg_bin=self.ffmpeg, filters=FilterSettings())
        store = TranscriptStore(50)
        status = FeedStatus()
        worker = FeedWorker(
            feed, settings, StubEngine(["Thank you for watching", "Thank you for watching"]),
            threading.Lock(), store, status,
            segmenter_factory=lambda: UtteranceSegmenter(speech_spans=energy_spans, min_utterance_s=0.5),
        )
        worker.start()
        deadline = time.time() + 60
        while time.time() < deadline and status.dropped.get("hallucination_marker", 0) < 2:
            time.sleep(0.1)
        worker.stop()
        worker.join(timeout=10)
        self.assertEqual(store.after("test", 0), [])
        self.assertEqual(status.dropped.get("hallucination_marker"), 2)


class SileroPathTests(unittest.TestCase):
    def test_silero_vad_loads_and_finds_no_speech_in_silence(self):
        from radio_transcriber.segmenter import silero_speech_spans

        spans = silero_speech_spans(np.zeros(16000 * 2, dtype=np.float32))
        self.assertEqual(spans, [])


class EngineTests(unittest.TestCase):
    def test_missing_model_fails_with_clear_error(self):
        from radio_transcriber.engine import FasterWhisperEngine

        with self.assertRaises(Exception):
            FasterWhisperEngine(model="/nonexistent/model/dir", download_root="/tmp/no-such-cache", device="cpu")


if __name__ == "__main__":
    unittest.main()
