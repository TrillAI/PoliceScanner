"""Radio transcript normalization.

This is a line-for-line port of services/transcriptNormalizer.ts in the app.
Keep the two in sync: the server and the app must turn the same spoken radio
text into the same canonical form, or the evaluation numbers will not match
what the app shows.
"""

import re

_UNITS = "zero|one|two|three|four|five|six|seven|eight|nine"
_TEENS = "ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen"
_TENS = "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety"

# Compound tens must be tried before the bare alternatives.
_NUMBER_WORDS = rf"(?:(?:{_TENS})(?:[ -](?:{_UNITS}))?|{_TEENS}|{_UNITS})"

_WORD_VALUES = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
    "eighty": 80, "ninety": 90,
}

_FLAGS = re.ASCII

_RE_LETTER_HYPHEN = re.compile(r"([a-z])-(?=[a-z])", _FLAGS)
_RE_PREFIX_HYPHEN_DIGIT = re.compile(r"\b(code|signal|unit)-(\d)", _FLAGS)
_RE_PUNCT = re.compile(r"[^a-z0-9\s-]", _FLAGS)
_RE_TWO_ELEVEN = re.compile(r"\btwo\s+eleven\b", _FLAGS)
_RE_PREFIX_NUMBER = re.compile(rf"\b(code|signal|unit)\s+({_NUMBER_WORDS})\b", _FLAGS)
_RE_TEN_NUMBER = re.compile(rf"\b(?:ten|10)\s+({_NUMBER_WORDS})\b", _FLAGS)
_RE_TEN_DIGITS = re.compile(r"\b10\s+([0-9]{1,2})\b", _FLAGS)
_RE_SPACES = re.compile(r"\s+", _FLAGS)

# Common recognizer mishearings of radio phrases. Each rule only fires where the
# lookahead shows a radio context, so ordinary sentences are left alone.
# Keep this table identical to RADIO_FIXES in services/transcriptNormalizer.ts.
_RADIO_CONTEXT = r"(?=\s*$|\s+(?:copy|roger|dispatch|unit|units|en route|received|affirmative|over|we|you|that|all|respond|responding)\b)"
_RE_TEN_FOR = re.compile(r"\b(?:ten|10)[ -]for\b" + _RADIO_CONTEXT, _FLAGS)
_RE_CODE_TREE = re.compile(r"\bcode (?:tree|free)\b", _FLAGS)
_RE_CODE_FOR = re.compile(
    r"\bcode for\b(?=\s*$|\s+(?:at|on|en|scene|no|all|copy|is|we|traffic|respond|responding|clear|with)\b)",
    _FLAGS,
)
_RE_SHOTS_FIRE = re.compile(r"\bshots?\s+fire(?:d)?\b", _FLAGS)
_RE_IN_ROUTE = re.compile(r"\bin route\b", _FLAGS)


def _spoken_to_digits(spoken: str) -> str:
    total = sum(_WORD_VALUES.get(word, 0) for word in re.split(r"[ -]", spoken))
    return str(total)


def normalize_radio_transcript(raw: str) -> str:
    text = raw.lower()
    text = _RE_LETTER_HYPHEN.sub(r"\1 ", text)
    text = _RE_PREFIX_HYPHEN_DIGIT.sub(r"\1 \2", text)
    text = _RE_PUNCT.sub(" ", text)
    text = _RE_TWO_ELEVEN.sub("211", text)
    text = _RE_PREFIX_NUMBER.sub(lambda m: f"{m.group(1)} {_spoken_to_digits(m.group(2))}", text)
    text = _RE_TEN_NUMBER.sub(lambda m: f"10-{_spoken_to_digits(m.group(1))}", text)
    text = _RE_TEN_DIGITS.sub(r"10-\1", text)
    text = _RE_TEN_FOR.sub("10-4", text)
    text = _RE_CODE_TREE.sub("code 3", text)
    text = _RE_CODE_FOR.sub("code 4", text)
    text = _RE_SHOTS_FIRE.sub("shots fired", text)
    text = _RE_IN_ROUTE.sub("en route", text)
    return _RE_SPACES.sub(" ", text).strip()
