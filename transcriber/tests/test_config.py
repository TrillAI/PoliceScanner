import json
import os
import tempfile
import unittest

from radio_transcriber.audio import DEFAULT_RADIO_FILTER
from radio_transcriber.config import DEFAULT_HOTWORDS, load_settings


class ConfigTests(unittest.TestCase):
    def setUp(self):
        fd, self.feeds = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w") as fh:
            json.dump({"feeds": [{"id": "city-police", "url": "https://example.com/stream"}]}, fh)

    def tearDown(self):
        os.unlink(self.feeds)

    def _load(self, **extra):
        env = {"FEEDS_FILE": self.feeds, "FFMPEG_BIN": "ffmpeg"}
        env.update(extra)
        return load_settings(env)

    def test_radio_defaults(self):
        s = self._load()
        self.assertEqual(s.radio_filter, DEFAULT_RADIO_FILTER)
        self.assertTrue(s.peak_normalize)
        self.assertAlmostEqual(s.min_utterance_s, 0.3)
        self.assertIn("10-99", DEFAULT_HOTWORDS)
        self.assertIn("shots fired", DEFAULT_HOTWORDS)

    def test_radio_filter_can_be_disabled_or_replaced(self):
        self.assertIsNone(self._load(RADIO_AUDIO_FILTER="off").radio_filter)
        self.assertIsNone(self._load(RADIO_AUDIO_FILTER="").radio_filter)
        self.assertEqual(self._load(RADIO_AUDIO_FILTER="highpass=f=250").radio_filter, "highpass=f=250")

    def test_peak_normalize_flag(self):
        self.assertFalse(self._load(PEAK_NORMALIZE="0").peak_normalize)
        self.assertFalse(self._load(PEAK_NORMALIZE="off").peak_normalize)
        self.assertTrue(self._load(PEAK_NORMALIZE="1").peak_normalize)


if __name__ == "__main__":
    unittest.main()
