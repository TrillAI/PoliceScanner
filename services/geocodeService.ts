// Turns a place description into coordinates using the device's geocoder
// (expo-location). Native only: on web geocodeAsync is not available, so this
// resolves to null and the map shows its list fallback instead.
//
// Results are cached for the session, calls run one at a time, and a result
// is rejected if it lands far from the feed's city. A "Main Street" match in
// another state is worse than no marker.

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { getDistanceKm } from './feedService';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const GEOCODE_TIMEOUT_MS = 10_000;
export const MAX_DISTANCE_FROM_FEED_KM = 60;

const cache = new Map<string, Coordinates | null>();
let queue: Promise<unknown> = Promise.resolve();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('geocode timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Geocode `query` (for example "Main and First, Cleveland, TN") and return the
 * best match that is within MAX_DISTANCE_FROM_FEED_KM of `near`, or null.
 */
export function geocodePlace(query: string, near: Coordinates): Promise<Coordinates | null> {
  if (Platform.OS === 'web') return Promise.resolve(null);

  const key = query.trim().toLowerCase();
  const run = async (): Promise<Coordinates | null> => {
    if (cache.has(key)) return cache.get(key) ?? null;
    let results: Location.LocationGeocodedLocation[];
    try {
      results = await withTimeout(Location.geocodeAsync(query), GEOCODE_TIMEOUT_MS);
    } catch {
      // Transient failure (offline, timeout): do not cache, so a later
      // transmission can try again.
      return null;
    }
    const first = results[0];
    const coords = first ? { latitude: first.latitude, longitude: first.longitude } : null;
    const accepted =
      coords &&
      getDistanceKm(coords.latitude, coords.longitude, near.latitude, near.longitude) <=
        MAX_DISTANCE_FROM_FEED_KM
        ? coords
        : null;
    cache.set(key, accepted);
    return accepted;
  };

  // Serialize calls: the device geocoder is slow and rate limited.
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
