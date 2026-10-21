import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useScanner } from '../../hooks/useScanner';
import IncidentMap from '../../components/feature/IncidentMap';
import { EmptyState } from '../../components';
import { Colors, FontSize, Spacing } from '../../constants/theme';

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { mapMarkers, clearMarkers } = useScanner();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Incident Map</Text>
          <Text style={styles.subtitle}>
            {mapMarkers.length === 0
              ? 'Places heard on the scanner'
              : `${mapMarkers.length} location${mapMarkers.length === 1 ? '' : 's'} heard on the scanner`}
          </Text>
        </View>
        {mapMarkers.length > 0 ? (
          <Pressable style={styles.clearBtn} onPress={clearMarkers}>
            <MaterialIcons name="delete-sweep" size={18} color={Colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {mapMarkers.length === 0 ? (
        <EmptyState
          icon="map"
          title="No locations yet"
          subtitle="Addresses, intersections, and highways heard on a live or demo feed are placed here."
        />
      ) : (
        <View style={styles.mapWrap}>
          <IncidentMap markers={mapMarkers} />
        </View>
      )}

      <Text style={[styles.footer, { paddingBottom: insets.bottom + Spacing.sm }]}>
        Locations come from automatic speech recognition and the device geocoder. Verify before acting.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  mapWrap: { flex: 1 },
  footer: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
});
