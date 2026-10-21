import json
import os
import unittest

from radio_transcriber.normalize import normalize_radio_transcript as norm

HERE = os.path.dirname(os.path.abspath(__file__))

# Same expectations as the app-side corpus in the TypeScript normalizer tests.
CASES = [
    ("Ten-Four, Unit 4.", "10-4 unit 4"),
    ("hit-and-run", "hit and run"),
    ("code-3", "code 3"),
    ("I-95 northbound", "i-95 northbound"),
    ("Two Eleven at Main", "211 at main"),
    ("ten ninety-nine", "10-99"),
    ("unit forty two", "unit 42"),
    ("Unit 4, copy, 10-4", "unit 4 copy 10-4"),
    ("Unit 4 copy 10 4", "unit 4 copy 10-4"),
    ("Unit 4 copy 10-40 on the channel", "unit 4 copy 10-40 on the channel"),
    ("Unit 8 we are code three", "unit 8 we are code 3"),
    ("Code thirty, officer needs help", "code 30 officer needs help"),
    ("Unit 12 has ten minutes to clear", "unit 12 has ten minutes to clear"),
    ("Case number 2110 filed", "case number 2110 filed"),
    # Radio mishearing corrections (see RADIO_FIXES in services/transcriptNormalizer.ts)
    ("Unit 4 ten for copy", "unit 4 10-4 copy"),
    ("10 for, en route", "10-4 en route"),
    ("ten-for", "10-4"),
    ("ten for the parade is at noon", "ten for the parade is at noon"),
    ("Unit 8 code tree to the scene", "unit 8 code 3 to the scene"),
    ("code free", "code 3"),
    ("unit 3 code for at the store", "unit 3 code 4 at the store"),
    ("code for the new door", "code for the new door"),
    ("shots fire at Broadway and 5th", "shots fired at broadway and 5th"),
    ("shot fired near oak", "shots fired near oak"),
    ("Unit 2 in route to hospital", "unit 2 en route to hospital"),
]


class NormalizeTests(unittest.TestCase):
    def test_cases(self):
        for raw, expected in CASES:
            with self.subTest(raw=raw):
                self.assertEqual(norm(raw), expected)

    def test_corpus_matches_expected_output(self):
        # The same corpus is checked against the TypeScript normalizer by
        # transcriber/tests/check_ts_normalizer.js.
        with open(os.path.join(HERE, "normalize_corpus.json"), encoding="utf-8") as fh:
            corpus = json.load(fh)
        for case in corpus:
            with self.subTest(raw=case["raw"]):
                self.assertEqual(norm(case["raw"]), case["normalized"])


if __name__ == "__main__":
    unittest.main()
