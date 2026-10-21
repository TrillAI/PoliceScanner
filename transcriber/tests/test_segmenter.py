import unittest

import numpy as np

from radio_transcriber.segmenter import SAMPLE_RATE, UtteranceSegmenter

SR = SAMPLE_RATE


def seconds(s):
    return int(s * SR)


def run_stream(segmenter, total_s, chunk_s=0.5):
    """Push silent chunks through the segmenter and collect what it emits."""
    emitted = []
    pos = 0
    chunk = seconds(chunk_s)
    total = seconds(total_s)
    while pos < total:
        n = min(chunk, total - pos)
        emitted.extend(segmenter.push(np.zeros(n, dtype=np.float32)))
        pos += n
    emitted.extend(segmenter.flush())
    return emitted


class SegmenterTests(unittest.TestCase):
    def _stub(self, spans):
        """Stub that reads the segmenter's own absolute offset via a back-reference."""
        holder = {}

        def spans_fn(buf):
            seg = holder["seg"]
            off = seg._offset
            out = []
            for start, end in spans:
                s, e = start - off, end - off
                if e <= 0 or s >= len(buf):
                    continue
                out.append((max(0, s), min(len(buf), e)))
            return out

        seg = UtteranceSegmenter(speech_spans=spans_fn, silence_ms=600, max_utterance_s=25, min_utterance_s=0.3)
        holder["seg"] = seg
        return seg

    def test_single_transmission_emitted_after_silence(self):
        seg = self._stub([(seconds(1.0), seconds(3.0))])
        out = run_stream(seg, total_s=6.0)
        self.assertEqual(len(out), 1)
        self.assertAlmostEqual(out[0].start_s, 1.0 - 0.2, places=2)
        self.assertAlmostEqual(out[0].end_s, 3.0 + 0.2, places=2)

    def test_two_transmissions_separated_by_long_gap(self):
        seg = self._stub([(seconds(1.0), seconds(2.0)), (seconds(5.0), seconds(6.5))])
        out = run_stream(seg, total_s=9.0)
        self.assertEqual(len(out), 2)
        self.assertLess(out[0].end_s, out[1].start_s)

    def test_short_pause_stays_in_one_transmission(self):
        # 300 ms pause is below the 600 ms threshold: one transmission, not two.
        seg = self._stub([(seconds(1.0), seconds(2.0)), (seconds(2.3), seconds(3.5))])
        out = run_stream(seg, total_s=6.0)
        self.assertEqual(len(out), 1)
        self.assertAlmostEqual(out[0].end_s, 3.5 + 0.2, places=2)

    def test_short_radio_acknowledgement_is_kept(self):
        # A "10-4" is about 0.4 s of speech. It must survive the minimum length.
        seg = self._stub([(seconds(1.0), seconds(1.4))])
        out = run_stream(seg, total_s=4.0)
        self.assertEqual(len(out), 1)

    def test_noise_burst_shorter_than_minimum_is_dropped(self):
        seg = self._stub([(seconds(1.0), seconds(1.2))])
        out = run_stream(seg, total_s=4.0)
        self.assertEqual(out, [])

    def test_long_transmission_is_forced_out_at_max_length(self):
        seg = self._stub([(seconds(0.5), seconds(40.0))])
        out = run_stream(seg, total_s=45.0)
        self.assertGreaterEqual(len(out), 1)
        for utt in out:
            self.assertLessEqual(utt.end_s - utt.start_s, 25.0 + 0.5)

    def test_buffer_stays_bounded_during_silence(self):
        seg = self._stub([])
        for _ in range(200):
            seg.push(np.zeros(seconds(0.5), dtype=np.float32))
        self.assertLessEqual(len(seg._buf), seconds(0.5) * 2)

    def test_audio_is_a_copy_of_the_right_span(self):
        seg = self._stub([(seconds(1.0), seconds(2.0))])
        audio = np.zeros(seconds(4.0), dtype=np.float32)
        audio[seconds(1.0):seconds(2.0)] = 0.5
        out = []
        for pos in range(0, len(audio), seconds(0.5)):
            out.extend(seg.push(audio[pos:pos + seconds(0.5)]))
        out.extend(seg.flush())
        self.assertEqual(len(out), 1)
        self.assertGreater(float(out[0].audio.max()), 0.4)


if __name__ == "__main__":
    unittest.main()
