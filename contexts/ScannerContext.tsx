import React, {
  createContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { Audio } from 'expo-av';
import { CrimeAlert, Feed, LogEntry, StreamStatus } from '../constants/types';
import { checkTranscriptForAlerts, getRandomDemoPhrase } from '../services/keywordService';
import { sendCrimeAlertNotification } from '../services/notificationService';

interface ScannerContextType {
  selectedFeed: Feed | null;
  streamStatus: StreamStatus;
  crimeAlerts: CrimeAlert[];
  logEntries: LogEntry[];
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
}

export const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [selectedFeed, setSelectedFeed] = useState<Feed | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [crimeAlerts, setCrimeAlerts] = useState<CrimeAlert[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [userLatitude, setUserLatitude] = useState(37.7749);
  const [userLongitude, setUserLongitude] = useState(-122.4194);

  const soundRef = useRef<Audio.Sound | null>(null);
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const startDemoTranscription = useCallback(
    (feed: Feed) => {
      // Demo mode: simulate radio chatter every 8–20 seconds
      // Real transcription requires a backend speech-to-text service
      const schedule = () => {
        const delay = 8000 + Math.random() * 12000;
        demoIntervalRef.current = setTimeout(async () => {
          const phrase = getRandomDemoPhrase();
          addLog({
            feedName: feed.name,
            agency: feed.agency,
            text: phrase,
            type: 'transcription',
          });
          const alert = checkTranscriptForAlerts(
            phrase,
            feed.name,
            feed.agency,
            userLatitude,
            userLongitude
          );
          if (alert) {
            await addAlert(alert);
          }
          schedule();
        }, delay);
      };
      schedule();
    },
    [addLog, addAlert, userLatitude, userLongitude]
  );

  const stopDemoTranscription = useCallback(() => {
    if (demoIntervalRef.current) {
      clearTimeout(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }
  }, []);

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
          if (!status.isLoaded) {
            if (status.error) {
              console.warn('Stream error:', status.error);
              setStreamStatus('error');
              stopDemoTranscription();
            }
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

      startDemoTranscription(selectedFeed);
    } catch (err: any) {
      console.warn('Failed to start stream:', err?.message);
      setStreamStatus('error');
      // Even if stream fails (e.g., Broadcastify requires auth), run demo mode
      addLog({
        feedName: selectedFeed.name,
        agency: selectedFeed.agency,
        text: `⚡ Running in demo mode — live stream requires Broadcastify account`,
        type: 'system',
      });
      setStreamStatus('playing');
      startDemoTranscription(selectedFeed);
    }
  }, [selectedFeed, addLog, startDemoTranscription, stopDemoTranscription]);

  const stopStream = useCallback(async () => {
    stopDemoTranscription();
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
  }, [selectedFeed, addLog, stopDemoTranscription]);

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

  useEffect(() => {
    return () => {
      stopDemoTranscription();
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, [stopDemoTranscription]);

  return (
    <ScannerContext.Provider
      value={{
        selectedFeed,
        streamStatus,
        crimeAlerts,
        logEntries,
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
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
}
