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


class RadioAudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ffmpeg = _default_ffmpeg()
        cls.tmp = tempfile.mkdtemp()

    def _tone(self, freq: int) -> str:
        path = os.path.join(self.tmp, f"tone_{freq}.wav")
        if not os.path.exists(path):
            subprocess.run(
                [self.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                 "-i", f"sine=frequency={freq}:duration=2:sample_rate=16000", path],
                check=True,
            )
        return path

    def test_ffmpeg_args_include_filter_only_when_given(self):
        with_filter = audio._ffmpeg_args("ffmpeg", "/x.wav", "highpass=f=300")
        self.assertIn("-af", with_filter)
        self.assertEqual(with_filter[with_filter.index("-af") + 1], "highpass=f=300")
        self.assertNotIn("-af", audio._ffmpeg_args("ffmpeg", "/x.wav", None))

    def test_band_filter_removes_hum_and_keeps_speech_band(self):
        rms = lambda a: float(np.sqrt(np.mean(a ** 2)))
        hum_raw = audio.decode_file(self.ffmpeg, self._tone(100), audio_filter=None)
        hum_filtered = audio.decode_file(self.ffmpeg, self._tone(100), audio_filter=audio.DEFAULT_RADIO_FILTER)
        self.assertLess(rms(hum_filtered), 0.2 * rms(hum_raw))

        voice_raw = audio.decode_file(self.ffmpeg, self._tone(1000), audio_filter=None)
        voice_filtered = audio.decode_file(self.ffmpeg, self._tone(1000), audio_filter=audio.DEFAULT_RADIO_FILTER)
        self.assertGreater(rms(voice_filtered), 0.8 * rms(voice_raw))

    def test_normalize_peak_scales_quiet_audio_to_target(self):
        quiet = np.full(1600, 0.2, dtype=np.float32)
        out = audio.normalize_peak(quiet, target=0.9)
        self.assertAlmostEqual(float(np.max(np.abs(out))), 0.9, places=5)

    def test_normalize_peak_caps_gain_and_skips_silence(self):
        faint = np.full(1600, 0.002, dtype=np.float32)
        out = audio.normalize_peak(faint, target=0.9, max_gain=10.0)
        self.assertAlmostEqual(float(np.max(np.abs(out))), 0.02, places=5)
        silence = np.zeros(1600, dtype=np.float32)
        self.assertIs(audio.normalize_peak(silence), silence)
        self.assertEqual(audio.normalize_peak(np.zeros(0, dtype=np.float32)).size, 0)

    def test_normalize_peak_never_clips(self):
        loud = np.array([0.6, -0.6, 0.3], dtype=np.float32)
        out = audio.normalize_peak(loud, target=0.9)
        self.assertLessEqual(float(np.max(np.abs(out))), 1.0)


if __name__ == "__main__":
    unittest.main()
