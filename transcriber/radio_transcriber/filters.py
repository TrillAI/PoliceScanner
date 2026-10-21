"""Decide which Whisper hypotheses are trustworthy enough to show.

Whisper invents text on silence, static, and music. Most of those inventions
are recognizable: stock YouTube-style phrases, very low confidence, or a
no-speech probability that is high. Radio audio is noisy, so these checks are
what keep the alert feed from filling up with phantom crime reports.
"""

import math
import re
from dataclasses import dataclass
from typing import Optional

# Phrases Whisper tends to emit on silence or music. Matched case-insensitively.
HALLUCINATION_MARKERS = (
    "thank you for watching",
    "thanks for watching",
    "subtitles by",
    "amara.org",
    "like and subscribe",
    "[music]",
    "(music)",
    "[silence]",
    "[blank_audio]",
)

# Single filler words that appear as the whole output on noise.
FILLER_ONLY = {"you", "thank you", "thanks", "bye", "bye bye", "okay", "ok", "uh", "um"}


@dataclass(frozen=True)
class Hypothesis:
    text: str
    avg_logprob: float  # mean token log-probability; closer to 0 is more confident
    no_speech_prob: float  # 0..1, probability the audio contains no speech
    compression_ratio: float  # high values indicate repetition loops


@dataclass(frozen=True)
class FilterSettings:
    max_no_speech_prob: float = 0.6
    min_avg_logprob: float = -1.0
    max_compression_ratio: float = 2.4


def judge(hyp: Hypothesis, settings: FilterSettings) -> Optional[str]:
    """Return None if the hypothesis should be kept, otherwise the drop reason."""
    text = re.sub(r"\s+", " ", hyp.text).strip()
    if not re.search(r"[A-Za-z0-9]", text):
        return "empty"

    lower = text.lower()
    if any(marker in lower for marker in HALLUCINATION_MARKERS):
        return "hallucination_marker"

    bare = re.sub(r"[^a-z ]", "", lower).strip()
    if bare in FILLER_ONLY:
        return "filler_only"

    if hyp.no_speech_prob > settings.max_no_speech_prob:
        return "no_speech"

    if hyp.avg_logprob < settings.min_avg_logprob:
        return "low_confidence"

    if hyp.compression_ratio > settings.max_compression_ratio:
        return "repetitive"

    return None


def confidence_from_logprob(avg_logprob: float) -> float:
    """Map mean token log-probability to a 0..1 score for display."""
    return max(0.0, min(1.0, math.exp(avg_logprob)))
