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
