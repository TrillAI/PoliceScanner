// Pure, platform-independent helpers used by keywordService.
// Keep numeric ten-codes intact so 10-40 cannot become a 10-4 match.
const numberWords: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const unitsPattern = 'one|two|three|four|five|six|seven|eight|nine';
const tensPattern = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const smallNumberPattern = 'nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten|zero|oh|' + unitsPattern;
const spokenNumberPattern = `(?:(?:${tensPattern})(?:\\s+(?:${unitsPattern}))?|${smallNumberPattern}|\\d{1,2})`;

function parseRadioNumber(value: string): number | null {
  if (/^\d{1,2}$/.test(value)) return Number(value);
  const parts = value.split(/\s+/);
  const first = numberWords[parts[0]];
  if (first === undefined) return null;
  if (parts.length === 1) return first;
  const second = numberWords[parts[1]];
  if (parts.length === 2 && first >= 20 && second !== undefined && second > 0 && second < 10) {
    return first + second;
  }
  return null;
}

export function normalizeRadioTranscript(transcript: string): string {
  const normalized = transcript
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/([a-z])-(?=[a-z])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized
    .replace(new RegExp(`\\bten[\\s-]+(${spokenNumberPattern})(?![a-z0-9])`, 'g'), (match: string, value: string) => {
      const number = parseRadioNumber(value);
      return number === null ? match : `10-${number}`;
    })
    .replace(new RegExp(`\\bcode\\s+(${spokenNumberPattern})(?![a-z0-9])`, 'g'), (match: string, value: string) => {
      const number = parseRadioNumber(value);
      return number === null ? match : `code ${number}`;
    })
    .replace(/\b10\s*-\s*(\d{1,2})(?!\d)\b/g, '10-$1')
    .replace(/\bhit\s+(?:and|&)\s+run\b/g, 'hit and run')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isResolutionCue(transcript: string): boolean {
  const normalized = normalizeRadioTranscript(transcript);
  const cues = /\b(?:all clear|false alarm(?: confirmed)?|(?:call|incident|response)(?: has been| was| is)? (?:cancelled|canceled|resolved)|code 4|scene (?:is )?(?:safe|secure))\b/g;
  let match: RegExpExecArray | null;

  while ((match = cues.exec(normalized)) !== null) {
    // Do not treat explicitly negated cues, such as "not all clear", as resolved.
    const preceding = normalized.slice(0, match.index);
    if (!/\b(?:not|never|no|isn't|is not)\s+(?:yet\s+)?$/.test(preceding)) {
      return true;
    }
  }
  return false;
}
