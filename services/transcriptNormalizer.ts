// Normalizes radio-style transcripts into the forms the keyword matcher expects.
//
// Speech-to-text output for police radio is inconsistent: the same ten-code
// may arrive as "10-4", "ten four", "ten-four", or "10 4"; "code 3" may arrive
// as "code three"; hyphenated phrases such as "hit-and-run" may keep or lose
// their hyphens. This module maps those variants onto one canonical form
// before matching. It only runs on the text used for matching; the original
// transcript is what gets stored and displayed.

const UNITS = 'zero|one|two|three|four|five|six|seven|eight|nine';
const TEENS = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';

// A spoken number of up to two words, e.g. "four", "ninety nine", "thirty-one".
// Order matters: compound tens must be tried before the bare alternatives.
const NUMBER_WORDS = `(?:(?:${TENS})(?:[ -](?:${UNITS}))?|${TEENS}|${UNITS})`;

const WORD_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

function spokenNumberToDigits(spoken: string): string {
  const total = spoken
    .split(/[ -]/)
    .reduce((sum, word) => sum + (WORD_VALUES[word] ?? 0), 0);
  return String(total);
}

export function normalizeRadioTranscript(raw: string): string {
  let text = raw.toLowerCase();

  // "ten-four" / "hit-and-run" -> "ten four" / "hit and run".
  // Hyphens between letters are word separators in speech.
  text = text.replace(/([a-z])-(?=[a-z])/g, '$1 ');
  // "code-3" -> "code 3" (radio prefixes only, so "I-95" keeps its hyphen).
  text = text.replace(/\b(code|signal|unit)-(\d)/g, '$1 $2');

  // Punctuation from the recognizer is not meaningful for matching.
  text = text.replace(/[^a-z0-9\s-]/g, ' ');

  // "two eleven" is spoken for 211 (robbery/burglary-in-progress call type).
  text = text.replace(/\btwo\s+eleven\b/g, '211');

  // Number words after a radio prefix: "code three" -> "code 3", "unit four" -> "unit 4".
  text = text.replace(
    new RegExp(`\\b(code|signal|unit)\\s+(${NUMBER_WORDS})\\b`, 'g'),
    (_m, prefix: string, spoken: string) => `${prefix} ${spokenNumberToDigits(spoken)}`
  );

  // Ten-codes spoken as words: "ten four" -> "10-4", "ten ninety nine" -> "10-99".
  text = text.replace(
    new RegExp(`\\b(?:ten|10)\\s+(${NUMBER_WORDS})\\b`, 'g'),
    (_m, spoken: string) => `10-${spokenNumberToDigits(spoken)}`
  );

  // Ten-codes spoken with digits and a space: "10 4" -> "10-4".
  text = text.replace(/\b10\s+(\d{1,2})\b/g, '10-$1');

  for (const [pattern, replacement] of RADIO_FIXES) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/\s+/g, ' ').trim();
}

// Common recognizer mishearings of radio phrases. Each rule only fires where the
// lookahead shows a radio context, so ordinary sentences are left alone.
// Keep this table identical to the Python table in transcriber/radio_transcriber/normalize.py.
const RADIO_CONTEXT =
  '(?=\\s*$|\\s+(?:copy|roger|dispatch|unit|units|en route|received|affirmative|over|we|you|that|all|respond|responding)\\b)';
const RADIO_FIXES: [RegExp, string][] = [
  [new RegExp('\\b(?:ten|10)[ -]for\\b' + RADIO_CONTEXT, 'g'), '10-4'],
  [/\bcode (?:tree|free)\b/g, 'code 3'],
  [
    /\bcode for\b(?=\s*$|\s+(?:at|on|en|scene|no|all|copy|is|we|traffic|respond|responding|clear|with)\b)/g,
    'code 4',
  ],
  [/\bshots?\s+fire(?:d)?\b/g, 'shots fired'],
  [/\bin route\b/g, 'en route'],
];

// Phrases that mean the reported situation has ended. A keyword that appears
// alongside one of these is still logged, but its severity is capped at LOW.
// Example: "All clear on that bomb threat, false alarm confirmed".
const RESOLUTION_CUE =
  /\b(all clear|false alarm|disregard|cancel(?:l)?ed|negative on)\b/;

export function isResolutionCue(normalizedTranscript: string): boolean {
  return RESOLUTION_CUE.test(normalizedTranscript);
}
