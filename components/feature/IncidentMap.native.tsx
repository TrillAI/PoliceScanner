// Native map (iOS Apple Maps, Android Google Maps) with one marker per place
// heard in a transmission. Tapping a marker shows what the pin was for and the
// transcript it came from.
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { MapMarker } from '../../constants/types';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import { markerColor, formatMarkerTime } from './mapStyle';

interface Props {
  markers: MapMarker[];
}

// Used before any marker exists: the app's default location.
const DEFAULT_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

export default function IncidentMap({ markers }: Props) {
  const mapRef = useRef<MapView>(null);

  const initialRegion = useMemo<Region>(() => {
    const first = markers[0];
    return first
      ? { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : DEFAULT_REGION;
    // Only the first render chooses the starting region; later updates use fitToCoordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep every pin in view as new places arrive.
  useEffect(() => {
    if (markers.length === 0 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(
      markers.map((m) => ({ latitude: m.latitude, longitude: m.longitude })),
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true }
    );
  }, [markers]);

  return (
    <MapView ref={mapRef} style={styles.map} initialRegion={initialRegion}>
      {markers.map((m) => (
        <Marker
          key={m.id}
          coordinate={{ latitude: m.latitude, longitude: m.longitude }}
          title={m.label}
          description={`${m.title} · ${m.feedName}`}
          pinColor={markerColor(m.severity)}
        >
          <Callout tooltip={false}>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>
                {m.title.toUpperCase()} — {m.label}
              </Text>
              <Text style={styles.calloutText}>{m.description}</Text>
              <Text style={styles.calloutMeta}>
                {m.agency} · {formatMarkerTime(m.timestamp)}
              </Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  callout: {
    width: 240,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    gap: 4,
  },
  calloutTitle: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  calloutText: { color: Colors.textSecondary, fontSize: FontSize.xs },
  calloutMeta: { color: Colors.textTertiary, fontSize: FontSize.xs },
});
