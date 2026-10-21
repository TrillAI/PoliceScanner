import unittest

from radio_transcriber.eval import _normalize_for_scoring, word_edit_distance, read_manifest
import tempfile, os


class EvalTests(unittest.TestCase):
    def test_spoken_and_written_ten_codes_score_equal(self):
        ref = _normalize_for_scoring("Unit 4 copy 10-4")
        hyp = _normalize_for_scoring("unit four copy ten four")
        self.assertEqual(word_edit_distance(ref, hyp), 0)

    def test_edit_distance_counts_substitutions_and_deletions(self):
        self.assertEqual(word_edit_distance(["a", "b", "c"], ["a", "x", "c"]), 1)
        self.assertEqual(word_edit_distance(["a", "b", "c"], ["a", "c"]), 1)
        self.assertEqual(word_edit_distance([], ["a"]), 1)

    def test_manifest_parsing_skips_comments_and_blanks(self):
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".tsv") as fh:
            fh.write("# header\n\nclips/a.wav\tUnit 4 copy 10-4\nclips/b.wav\tShots fired\n")
            path = fh.name
        try:
            self.assertEqual(read_manifest(path), [("clips/a.wav", "Unit 4 copy 10-4"), ("clips/b.wav", "Shots fired")])
        finally:
            os.unlink(path)


if __name__ == "__main__":
    unittest.main()
