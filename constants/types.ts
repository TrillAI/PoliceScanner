export interface Feed {
  id: string;
  name: string;
  agency: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  url: string;
  listeners?: number;
  description?: string;
  tags: string[];
}

export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CrimeAlert {
  id: string;
  timestamp: string;
  feedName: string;
  agency: string;
  transcription: string;
  matchedKeyword: string;
  severity: AlertSeverity;
  location: string;
  read: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  feedName: string;
  agency: string;
  text: string;
  type: 'transcription' | 'system' | 'alert';
}

export type StreamStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

// A location heard in a transmission, placed on the map once geocoded.
export interface MapMarker {
  id: string;
  feedId: string;
  feedName: string;
  agency: string;
  label: string; // the place as heard, e.g. "Broadway and 5th"
  title: string; // what the transmission was about, e.g. "shots fired" or "Location mentioned"
  severity: AlertSeverity | null;
  description: string; // the transcript text
  latitude: number;
  longitude: number;
  timestamp: string;
}
