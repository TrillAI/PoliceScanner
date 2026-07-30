import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

interface GeoState {
  latitude: number | null;
  longitude: number | null;
  cityLabel: string;
  error: string | null;
  loading: boolean;
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({
    latitude: null,
    longitude: null,
    cityLabel: 'Locating...',
    error: null,
    loading: true,
  });

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setState((s) => ({
            ...s,
            loading: false,
            error: 'Location permission denied',
            cityLabel: 'Location unavailable',
          }));
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        let cityLabel = `${loc.coords.latitude.toFixed(2)}°, ${loc.coords.longitude.toFixed(2)}°`;
        try {
          const [place] = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (place?.city && place?.region) {
            cityLabel = `${place.city}, ${place.region}`;
          } else if (place?.city) {
            cityLabel = place.city;
          }
        } catch (_) {}

        setState({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          cityLabel,
          error: null,
          loading: false,
        });

        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 500 },
          (updated) => {
            setState((prev) => ({
              ...prev,
              latitude: updated.coords.latitude,
              longitude: updated.coords.longitude,
            }));
          }
        );
      } catch (err: any) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err?.message ?? 'Location error',
          cityLabel: 'Location error',
        }));
      }
    })();

    return () => {
      sub?.remove();
    };
  }, []);

  return state;
}
