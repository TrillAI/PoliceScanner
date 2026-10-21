// Client for the live radio transcriber service (see transcriber/README.md).
//
// Configuration is read at build time from Expo public env vars:
//   EXPO_PUBLIC_TRANSCRIBER_URL    base URL of the transcriber, e.g. https://radio.example.com
//   EXPO_PUBLIC_TRANSCRIBER_TOKEN  optional bearer token
//
// Note: anything prefixed EXPO_PUBLIC_ is compiled into the app bundle and is
// visible to users. Only use a token that is acceptable to expose, or put the
// service behind your own authenticated proxy.

const BASE_URL = (process.env.EXPO_PUBLIC_TRANSCRIBER_URL ?? '').trim().replace(/\/+$/, '');
const TOKEN = (process.env.EXPO_PUBLIC_TRANSCRIBER_TOKEN ?? '').trim();

export interface RemoteTranscript {
  seq: number;
  feedId: string;
  startedAt: number; // unix seconds
  durationS: number;
  text: string;
  normalized: string;
  confidence: number; // 0..1
}

export interface TranscriptPage {
  segments: RemoteTranscript[];
  latest: number;
}

export function isLiveTranscriptionConfigured(): boolean {
  return BASE_URL.length > 0;
}

/**
 * Fetch transcripts for a feed.
 * - `after === null`: returns no segments but the current cursor. Use this to
 *   start listening without replaying older traffic as new alerts.
 * - `after === n`: returns segments with seq > n.
 */
export async function fetchTranscripts(
  feedId: string,
  after: number | null,
  timeoutMs = 8000
): Promise<TranscriptPage> {
  if (!BASE_URL) throw new Error('Transcriber URL is not configured');

  const query = after === null ? '' : `?after=${after}`;
  const url = `${BASE_URL}/feeds/${encodeURIComponent(feedId)}/transcripts${query}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`transcriber responded ${res.status}`);
    const body = await res.json();
    const segments: RemoteTranscript[] = (body.segments ?? []).map((s: any) => ({
      seq: Number(s.seq),
      feedId: String(s.feedId),
      startedAt: Number(s.startedAt),
      durationS: Number(s.durationS),
      text: String(s.text),
      normalized: String(s.normalized ?? s.text),
      confidence: Number(s.confidence ?? 0),
    }));
    return { segments, latest: Number(body.latest ?? 0) };
  } finally {
    clearTimeout(timer);
  }
}
