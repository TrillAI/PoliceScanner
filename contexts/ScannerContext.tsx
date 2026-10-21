import React, {
  createContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { Audio } from 'expo-av';
import { CrimeAlert, Feed, LogEntry, MapMarker, StreamStatus } from '../constants/types';
import { checkTranscriptForAlerts, getRandomDemoPhrase } from '../services/keywordService';
import { sendCrimeAlertNotification } from '../services/notificationService';
import { fetchTranscripts, isLiveTranscriptionConfigured } from '../services/transcriberClient';
import { extractLocationCandidates } from '../services/locationExtractor';
import { geocodePlace } from '../services/geocodeService';

// How often the app asks the transcriber for new transmissions, and the
// upper bound on retry delay while the transcriber is unreachable.
const LIVE_POLL_INTERVAL_MS = 2000;
const LIVE_MAX_BACKOFF_MS = 30000;

// The same place from the same feed is only marked once per window, so a
// unit repeating "Main and First" does not stack pins on the map.
const MARKER_DEDUPE_MS = 15 * 60 * 1000;
const MAX_MAP_MARKERS = 200;

export type TranscriptionMode = 'off' | 'live' | 'demo';

interface ScannerContextType {
  selectedFeed: Feed | null;
  streamStatus: StreamStatus;
  transcriptionMode: TranscriptionMode;
  crimeAlerts: CrimeAlert[];
  logEntries: LogEntry[];
  mapMarkers: MapMarker[];
  unreadCount: number;
  userLatitude: number;
  userLongitude: number;
  setUserLocation: (lat: number, lon: number) => void;
  selectFeed: (feed: Feed) => void;
  startStream: () => Promise<void>;
  stopStream: () => Promise<void>;
  markAlertRead: (id: string) => void;
  markAllRead: () => void;
  clearAlerts: () => void;
  clearLogs: () => void;
  clearMarkers: () => void;
}

export const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [selectedFeed, setSelectedFeed] = useState<Feed | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('off');
  const [crimeAlerts, setCrimeAlerts] = useState<CrimeAlert[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [userLatitude, setUserLatitude] = useState(37.7749);
  const [userLongitude, setUserLongitude] = useState(-122.4194);

  const soundRef = useRef<Audio.Sound | null>(null);
  const demoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopLiveRef = useRef<(() => void) | null>(null);
  // Read by the transcription loops so they never act on stale coordinates.
  const locationRef = useRef({ lat: 37.7749, lon: -122.4194 });
  // Place key ("feedId|place") -> time it was last marked.
  const recentPlacesRef = useRef(new Map<string, number>());

  useEffect(() => {
    locationRef.current = { lat: userLatitude, lon: userLongitude };
  }, [userLatitude, userLongitude]);

  const unreadCount = crimeAlerts.filter((a) => !a.read).length;

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newEntry: LogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    setLogEntries((prev) => [newEntry, ...prev].slice(0, 200));
  }, []);

  const addAlert = useCallback(
    async (alert: CrimeAlert) => {
      setCrimeAlerts((prev) => [alert, ...prev].slice(0, 100));
      addLog({
        feedName: alert.feedName,
        agency: alert.agency,
        text: `⚠️ [${alert.severity}] "${alert.matchedKeyword}" — ${alert.transcription}`,
        type: 'alert',
      });
      await sendCrimeAlertNotification(alert);
    },
    [addLog]
  );

  const setUserLocation = useCallback((lat: number, lon: number) => {
    setUserLatitude(lat);
    setUserLongitude(lon);
  }, []);

  const selectFeed = useCallback((feed: Feed) => {
    setSelectedFeed(feed);
  }, []);

  // Geocode any places named in a transmission and pin them on the map. The
  // pin's title says why it was placed: the alert keyword, or a generic label.
  const markPlaces = useCallback((feed: Feed, text: string, alert: CrimeAlert | null) => {
    const now = Date.now();
    const recent = recentPlacesRef.current;
    if (recent.size > 500) {
      for (const [key, t] of recent) {
        if (now - t > MARKER_DEDUPE_MS) recent.delete(key);
      }
    }

    for (const candidate of extractLocationCandidates(text)) {
      const key = `${feed.id}|${candidate.query.toLowerCase()}`;
      const last = recent.get(key);
      if (last !== undefined && now - last < MARKER_DEDUPE_MS) continue;
      recent.set(key, now);

      const query = `${candidate.query}, ${feed.city}, ${feed.state}`;
      void geocodePlace(query, { latitude: feed.latitude, longitude: feed.longitude }).then(
        (coords) => {
          if (!coords) return;
          const marker: MapMarker = {
            id: `marker-${now}-${Math.random().toString(36).slice(2, 8)}`,
            feedId: feed.id,
            feedName: feed.name,
            agency: feed.agency,
            label: candidate.label,
            title: alert ? alert.matchedKeyword : 'Location mentioned',
            severity: alert ? alert.severity : null,
            description: text,
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp: new Date().toISOString(),
          };
          setMapMarkers((prev) => [marker, ...prev].slice(0, MAX_MAP_MARKERS));
        }
      );
    }
  }, []);

  // Shared by live and demo modes: log the transmission, raise any alert, and
  // mark any locations it names.
  const handleTranscript = useCallback(
    (feed: Feed, text: string) => {
      addLog({
        feedName: feed.name,
        agency: feed.agency,
        text,
        type: 'transcription',
      });
      const { lat, lon } = locationRef.current;
      const alert = checkTranscriptForAlerts(text, feed.name, feed.agency, lat, lon);
      if (alert) {
        void addAlert(alert);
      }
      markPlaces(feed, text, alert);
    },
    [addLog, addAlert, markPlaces]
  );

  const startDemoTranscription = useCallback(
    (feed: Feed) => {
      // Demo mode: simulate radio chatter every 8–20 seconds.
      const schedule = () => {
        const delay = 8000 + Math.random() * 12000;
        demoTimeoutRef.current = setTimeout(() => {
          handleTranscript(feed, getRandomDemoPhrase());
          schedule();
        }, delay);
      };
      schedule();
    },
    [handleTranscript]
  );

  const startLiveTranscription = useCallback(
    (feed: Feed): (() => void) => {
      let cancelled = false;
      let cursor: number | null = null;
      let failures = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const schedule = (delayMs: number) => {
        if (!cancelled) timer = setTimeout(tick, delayMs);
      };

      const tick = async () => {
        try {
          const page = await fetchTranscripts(feed.id, cursor);
          if (cursor === null || page.latest < cursor) {
            // First poll, or the server restarted and its sequence numbers reset.
            // Start from the current position rather than replaying history.
            cursor = page.latest;
          } else {
            for (const seg of page.segments) {
              handleTranscript(feed, seg.text);
              cursor = seg.seq;
            }
          }
          if (failures > 0) {
            failures = 0;
            addLog({
              feedName: feed.name,
              agency: feed.agency,
              text: '✅ Transcriber reconnected',
              type: 'system',
            });
          }
          schedule(LIVE_POLL_INTERVAL_MS);
        } catch {
          failures += 1;
          if (failures === 1) {
            addLog({
              feedName: feed.name,
              agency: feed.agency,
              text: '⚠️ Transcriber unreachable — retrying',
              type: 'system',
            });
          }
          schedule(Math.min(LIVE_POLL_INTERVAL_MS * 2 ** failures, LIVE_MAX_BACKOFF_MS));
        }
      };

      void tick();

      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    },
    [addLog, handleTranscript]
  );

  const stopTranscription = useCallback(() => {
    if (demoTimeoutRef.current) {
      clearTimeout(demoTimeoutRef.current);
      demoTimeoutRef.current = null;
    }
    if (stopLiveRef.current) {
      stopLiveRef.current();
      stopLiveRef.current = null;
    }
  }, []);

  const startTranscription = useCallback(
    (feed: Feed) => {
      stopTranscription();
      if (isLiveTranscriptionConfigured()) {
        stopLiveRef.current = startLiveTranscription(feed);
        setTranscriptionMode('live');
      } else {
        startDemoTranscription(feed);
        setTranscriptionMode('demo');
      }
    },
    [stopTranscription, startLiveTranscription, startDemoTranscription]
  );

  const startStream = useCallback(async () => {
    if (!selectedFeed) return;
    setStreamStatus('loading');

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
      });

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: selectedFeed.url },
        { shouldPlay: true, volume: 1.0, isLooping: false },
        (status) => {
          if (!status.isLoaded && status.error) {
            console.warn('Stream error:', status.error);
            setStreamStatus('error');
          }
        }
      );

      soundRef.current = sound;
      setStreamStatus('playing');

      addLog({
        feedName: selectedFeed.name,
        agency: selectedFeed.agency,
        text: `🟢 Stream started — ${selectedFeed.name} (${selectedFeed.city}, ${selectedFeed.state})`,
        type: 'system',
      });

      startTranscription(selectedFeed);
    } catch (err: any) {
      console.warn('Failed to start stream:', err?.message);
      setStreamStatus('error');
      // Audio can fail on the device while the server still transcribes the feed.
      const live = isLiveTranscriptionConfigured();
      addLog({
        feedName: selectedFeed.name,
        agency: selectedFeed.agency,
        text: live
          ? '⚡ Audio playback unavailable — transcription is still running on the server'
          : '⚡ Running in demo mode — live stream requires Broadcastify account',
        type: 'system',
      });
      setStreamStatus('playing');
      startTranscription(selectedFeed);
    }
  }, [selectedFeed, addLog, startTranscription]);

  const stopStream = useCallback(async () => {
    stopTranscription();
    setTranscriptionMode('off');
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (_) {}
      soundRef.current = null;
    }
    setStreamStatus('idle');
    if (selectedFeed) {
      addLog({
        feedName: selectedFeed.name,
        agency: selectedFeed.agency,
        text: `🔴 Stream stopped — ${selectedFeed.name}`,
        type: 'system',
      });
    }
  }, [selectedFeed, addLog, stopTranscription]);

  const markAlertRead = useCallback((id: string) => {
    setCrimeAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: true } : a))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setCrimeAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  }, []);

  const clearAlerts = useCallback(() => setCrimeAlerts([]), []);
  const clearLogs = useCallback(() => setLogEntries([]), []);
  const clearMarkers = useCallback(() => {
    setMapMarkers([]);
    recentPlacesRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      stopTranscription();
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, [stopTranscription]);

  return (
    <ScannerContext.Provider
      value={{
        selectedFeed,
        streamStatus,
        transcriptionMode,
        crimeAlerts,
        logEntries,
        mapMarkers,
        unreadCount,
        userLatitude,
        userLongitude,
        setUserLocation,
        selectFeed,
        startStream,
        stopStream,
        markAlertRead,
        markAllRead,
        clearAlerts,
        clearLogs,
        clearMarkers,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
}
