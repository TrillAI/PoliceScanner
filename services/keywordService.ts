import { AlertSeverity, CrimeAlert } from '../constants/types';

export const KEYWORDS: Record<AlertSeverity, string[]> = {
  HIGH: [
    'shooting', 'active shooter', 'shots fired', 'hostage', 'kidnapping',
    'murder', 'homicide', 'terrorism', 'bomb', 'explosion', 'robbery',
    'armed', 'gunshot', 'stabbing', 'officer down', 'code 3', 'code 30',
    'weapons', 'assault with deadly', 'carjacking', 'amber alert', '10-99',
  ],
  MEDIUM: [
    'burglary', 'theft', 'vandalism', 'fight', 'disturbance', 'domestic',
    'dui', 'accident', 'hit and run', 'suspicious person', 'suspicious vehicle',
    'alarm', 'trespassing', 'pursuit', 'fleeing', 'foot pursuit', '211',
    'breaking and entering', 'auto theft', 'harassment', '10-31',
  ],
  LOW: [
    'traffic stop', 'parking violation', 'noise complaint', 'animal complaint',
    'welfare check', '10-4', 'code 4', 'minor accident', 'road hazard',
    'abandoned vehicle', 'found property',
  ],
};

// Simulated realistic police radio phrases for demo mode
// Real transcription requires a backend speech-to-text service
export const DEMO_PHRASES = [
  'Unit 42, respond to 10-11 at the corner of Main and First, code 2',
  'All units, be advised of suspicious vehicle, dark sedan, license plate 7ABC123',
  'Dispatch, Unit 15 is code 4 at the scene, no injuries reported',
  'Unit 7, we have a 415 noise complaint at 3rd Avenue apartment complex',
  'Requesting backup, shots fired at the intersection of Broadway and 5th',
  'Code 4 on that welfare check, subject is safe',
  'Unit 22 conducting traffic stop on northbound I-95, occupant acting suspicious',
  'All units, BOLO for a robbery suspect, male, early 20s, last seen heading east',
  'Dispatch, we have a domestic disturbance at 245 Oak Street, respond code 2',
  '10-4, en route to the scene, ETA 3 minutes',
  'Unit 8, officer needs assistance on 5th and Market, code 3',
  'Alarm activation at First National Bank, units respond',
  'Traffic accident on the freeway interchange, blocking two lanes',
  'Foot pursuit in progress, suspect heading southbound on River Road',
  'Code 3 response to active fight outside Club Havana on Main Street',
  'Unit 31, 10-15, suspect in custody, transporting to booking',
  'Be advised, DUI driver heading west on Highway 9, black SUV swerving',
  'Burglary in progress at the storage facility on Industrial Boulevard',
  'Unit 18, we have a hit and run on Oak and Maple, victim requesting medical',
  'All clear on that bomb threat at City Hall, false alarm confirmed',
  'Missing juvenile reported, 13-year-old female, last seen wearing a red jacket',
  'Unit 54, carjacking just occurred at the parking structure on 2nd Street',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word matching so that e.g. "disarmed" does not match "armed"
// and "10-40" does not match "10-4".
const KEYWORD_PATTERNS: Record<AlertSeverity, { keyword: string; pattern: RegExp }[]> = {
  HIGH: [],
  MEDIUM: [],
  LOW: [],
};
(['HIGH', 'MEDIUM', 'LOW'] as AlertSeverity[]).forEach((severity) => {
  KEYWORD_PATTERNS[severity] = KEYWORDS[severity].map((keyword) => ({
    keyword,
    pattern: new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}($|[^a-z0-9])`, 'i'),
  }));
});

export function checkTranscriptForAlerts(
  transcript: string,
  feedName: string,
  agency: string,
  latitude: number,
  longitude: number
): CrimeAlert | null {
  // Severity tiers are checked HIGH -> MEDIUM -> LOW; first match wins.
  for (const severity of ['HIGH', 'MEDIUM', 'LOW'] as AlertSeverity[]) {
    for (const { keyword, pattern } of KEYWORD_PATTERNS[severity]) {
      if (pattern.test(transcript)) {
        return {
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          feedName,
          agency,
          transcription: transcript,
          matchedKeyword: keyword,
          severity,
          location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          read: false,
        };
      }
    }
  }
  return null;
}

export function getRandomDemoPhrase(): string {
  return DEMO_PHRASES[Math.floor(Math.random() * DEMO_PHRASES.length)];
}
