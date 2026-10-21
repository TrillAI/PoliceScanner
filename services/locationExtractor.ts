// Pull place references out of radio transcripts so they can be geocoded.
//
// Handles three forms common in dispatch traffic:
//   - numbered addresses:      "245 Oak Street"
//   - named streets:           "on Main Street", "at 3rd Avenue"
//   - intersections:           "corner of Main and First", "Broadway and 5th"
//   - numbered highways:       "I-95", "Highway 9"
//
// Input is run through the radio normalizer first, so spoken forms such as
// "two eleven" and "ten four" are already in canonical form.

import { normalizeRadioTranscript } from './transcriptNormalizer';

export type LocationKind = 'address' | 'street' | 'intersection' | 'highway';

export interface LocationCandidate {
  kind: LocationKind;
  query: string; // text to geocode, without city/state (lowercase, normalized)
  label: string; // the same place for display, e.g. "Broadway and 5th"
}

// Display casing for a normalized place name. Ordinals and numbers are left as
// they are ("5th", "245"), "and" stays lowercase, and interstate and US route
// numbers keep their conventional form ("I-95", "US 101").
export function displayLabel(query: string): string {
  return query
    .split(' ')
    .map((word, i) => {
      if (/^i-\d+$/.test(word)) return word.toUpperCase();
      if (word === 'us') return 'US';
      if (i > 0 && word === 'and') return word;
      if (/^\d/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

const STREET_SUFFIX =
  'street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|parkway|pkwy|circle|terrace|trail|square|highway|hwy|freeway|expressway|bridge';

// Words that cannot be part of a street name. Used to reject phrases such as
// "unit 5 and dispatch" or "the suspect on the road".
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'our', 'their', 'his', 'her', 'its',
  'and', 'or', 'but', 'of', 'to', 'from', 'with', 'in', 'is', 'are', 'was', 'be', 'we', 'they', 'he', 'she', 'it',
  'unit', 'units', 'suspect', 'suspects', 'victim', 'victims', 'officer', 'officers', 'subject', 'subjects',
  'dispatch', 'vehicle', 'vehicles', 'male', 'female', 'juvenile', 'caller', 'person', 'persons', 'people',
  'all', 'both', 'some', 'any', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'zero',
  'code', 'copy', 'respond', 'on', 'at', 'near', 'along', 'by', 'off', 'over', 'out',
  'dark', 'blue', 'black', 'white', 'red', 'green', 'silver', 'gray', 'grey', 'sedan', 'suv', 'truck', 'car', 'van',
  'scene', 'area', 'location', 'building', 'store', 'bank', 'apartment', 'complex', 'facility', 'lot', 'parking', 'structure',
  'noise', 'complaint', 'traffic', 'stop', 'alarm', 'call',
]);

// Street names that are unambiguous enough to anchor an intersection on their own.
const STREET_NAME_WORDS = new Set([
  'broadway', 'main', 'market', 'oak', 'maple', 'elm', 'pine', 'cedar', 'park', 'mission', 'union', 'grand',
  'lake', 'river', 'king', 'central', 'church', 'sunset', 'washington', 'lincoln', 'jefferson', 'franklin',
  'madison', 'jackson', 'lexington', 'highland', 'spring', 'center', 'water', 'college', 'harbor', 'bay',
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth',
]);

const ORDINAL_RE = /^\d+(st|nd|rd|th)$/;

// Prefix words that can introduce a place: "at", "on", "corner of", ...
const INTERSECTION_PREFIX = '(?:intersection of|corner of|corner|at|on|near|and at)';

const RE_ADDRESS = new RegExp(
  `\\b(\\d{1,5}) ((?:[a-z0-9]+ ){1,3}?)(${STREET_SUFFIX})\\b`,
  'g'
);
const RE_NAMED_STREET = new RegExp(
  `\\b(?:on|at|near|along|off|by) (?:the )?((?:[a-z0-9]+ ){0,2}[a-z0-9]+) (${STREET_SUFFIX})\\b`,
  'g'
);
const RE_INTERSECTION = new RegExp(
  `\\b${INTERSECTION_PREFIX} (?:the )?([a-z0-9]+(?: (?:${STREET_SUFFIX}))?) and (?:the )?([a-z0-9]+(?: (?:${STREET_SUFFIX}))?)\\b`,
  'g'
);
const RE_HIGHWAY = /\b(i-\d{1,3}|interstate \d{1,3}|highway \d{1,3}|hwy \d{1,3}|route \d{1,3}|us \d{1,3})\b/g;

// Words directly before a house number that mean the number is not an address.
const NOT_ADDRESS_PREV = new Set(['unit', 'code', 'signal', 'ten', '10', 'channel', 'ch', 'sector', 'district', 'beat']);

function hasStopWord(phrase: string): boolean {
  return phrase.split(' ').some((w) => STOP_WORDS.has(w));
}

function isStreetLike(side: string): boolean {
  const word = side.split(' ')[0];
  return ORDINAL_RE.test(word) || STREET_NAME_WORDS.has(word);
}

export function extractLocationCandidates(transcript: string): LocationCandidate[] {
  const text = normalizeRadioTranscript(transcript);
  const found: LocationCandidate[] = [];
  const seen = new Set<string>();

  const add = (kind: LocationKind, query: string) => {
    const key = query.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ kind, query, label: displayLabel(query) });
    }
  };

  for (const m of text.matchAll(RE_ADDRESS)) {
    const before = text.slice(0, m.index).trim().split(' ').pop() ?? '';
    const words = m[2].trim();
    if (NOT_ADDRESS_PREV.has(before) || hasStopWord(words)) continue;
    add('address', `${m[1]} ${words} ${m[3]}`);
  }

  for (const m of text.matchAll(RE_NAMED_STREET)) {
    const name = m[1].trim();
    if (hasStopWord(name)) continue;
    add('street', `${name} ${m[2]}`);
  }

  for (const m of text.matchAll(RE_INTERSECTION)) {
    const left = m[1].trim();
    const right = m[2].trim();
    if (hasStopWord(left) || hasStopWord(right)) continue;
    // Require at least one street-like side, so "store and bank" does not match.
    if (!isStreetLike(left) && !isStreetLike(right)) continue;
    add('intersection', `${left} and ${right}`);
  }

  for (const m of text.matchAll(RE_HIGHWAY)) {
    add('highway', m[1]);
  }

  return found;
}
