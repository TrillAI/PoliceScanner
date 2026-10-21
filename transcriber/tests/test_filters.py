import unittest

from radio_transcriber.filters import FilterSettings, Hypothesis, judge

S = FilterSettings()


def hyp(text, logprob=-0.3, no_speech=0.05, comp=1.2):
    return Hypothesis(text=text, avg_logprob=logprob, no_speech_prob=no_speech, compression_ratio=comp)


class FilterTests(unittest.TestCase):
    def test_keeps_confident_radio_text(self):
        self.assertIsNone(judge(hyp("Unit 4 copy 10-4 en route"), S))

    def test_drops_empty_and_punctuation_only(self):
        self.assertEqual(judge(hyp("   "), S), "empty")
        self.assertEqual(judge(hyp("..."), S), "empty")

    def test_drops_known_hallucinations(self):
        self.assertEqual(judge(hyp("Thank you for watching!"), S), "hallucination_marker")
        self.assertEqual(judge(hyp("[MUSIC]"), S), "hallucination_marker")

    def test_drops_filler_only(self):
        self.assertEqual(judge(hyp("Thank you."), S), "filler_only")
        self.assertEqual(judge(hyp("you"), S), "filler_only")

    def test_drops_no_speech(self):
        self.assertEqual(judge(hyp("Shots fired", no_speech=0.9), S), "no_speech")

    def test_drops_low_confidence(self):
        self.assertEqual(judge(hyp("suspect armed", logprob=-1.4), S), "low_confidence")

    def test_drops_repetition_loops(self):
        self.assertEqual(judge(hyp("ten four ten four ten four", comp=3.0), S), "repetitive")

    def test_hallucination_check_wins_over_confidence(self):
        self.assertEqual(judge(hyp("Thanks for watching", logprob=-2.0), S), "hallucination_marker")


if __name__ == "__main__":
    unittest.main()
