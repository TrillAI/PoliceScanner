import os
import subprocess
import tempfile
import unittest

import numpy as np

from radio_transcriber import audio
from radio_transcriber.config import _default_ffmpeg


class AudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ffmpeg = _default_ffmpeg()
        cls.tmp = tempfile.mkdtemp()
        cls.wav = os.path.join(cls.tmp, "tone.wav")
        # 3 s of 440 Hz tone at 8 kHz stereo: exercises resampling and downmix.
        subprocess.run(
            [cls.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
             "-i", "sine=frequency=440:duration=3:sample_rate=8000", "-ac", "2", cls.wav],
            check=True,
        )

    def test_decode_file_resamples_to_16k_mono(self):
        pcm = audio.decode_file(self.ffmpeg, self.wav)
        self.assertEqual(pcm.dtype, np.float32)
        self.assertAlmostEqual(len(pcm) / 16000.0, 3.0, delta=0.05)
        # lavfi sine defaults to amplitude 1/8; check the signal is present, not its exact level
        self.assertGreater(float(np.abs(pcm).max()), 0.05)

    def test_iter_chunks_yields_half_second_pieces(self):
        proc = audio.start_decoder(self.ffmpeg, self.wav)
        chunks = list(audio.iter_chunks(proc))
        proc.stderr.close()
        proc.wait()
        self.assertTrue(all(len(c) == 8000 for c in chunks[:-1]))
        self.assertAlmostEqual(sum(len(c) for c in chunks) / 16000.0, 3.0, delta=0.05)

    def test_missing_source_raises(self):
        with self.assertRaises(RuntimeError):
            audio.decode_file(self.ffmpeg, os.path.join(self.tmp, "does-not-exist.wav"))


if __name__ == "__main__":
    unittest.main()
