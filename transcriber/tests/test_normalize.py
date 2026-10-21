import unittest

from radio_transcriber.normalize import normalize_radio_transcript as norm

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
]


class NormalizeTests(unittest.TestCase):
    def test_cases(self):
        for raw, expected in CASES:
            with self.subTest(raw=raw):
                self.assertEqual(norm(raw), expected)


if __name__ == "__main__":
    unittest.main()
