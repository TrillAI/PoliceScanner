// List fallback used on web, where react-native-maps is not available.
// The native build uses IncidentMap.native.tsx instead (Metro picks it
// automatically on iOS and Android). Both export the same props.
import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { MapMarker } from '../../constants/types';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import { markerColor, formatMarkerTime } from './mapStyle';

interface Props {
  markers: MapMarker[];
}

export default function IncidentMap({ markers }: Props) {
  return (
    <FlatList
      data={markers}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <Text style={styles.note}>
          The interactive map runs in the iOS and Android apps. Locations are listed here.
        </Text>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: markerColor(item.severity) }]} />
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.time}>{formatMarkerTime(item.timestamp)}</Text>
          </View>
          <Text style={styles.purpose}>{item.title}</Text>
          <Text style={styles.description} numberOfLines={3}>
            {item.description}
          </Text>
          <Text style={styles.meta}>
            {item.feedName} · {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.md, gap: Spacing.sm },
  note: { color: Colors.textTertiary, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  time: { color: Colors.textTertiary, fontSize: FontSize.xs },
  purpose: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', textTransform: 'uppercase' },
  description: { color: Colors.textPrimary, fontSize: FontSize.sm, lineHeight: 18 },
  meta: { color: Colors.textTertiary, fontSize: FontSize.xs },
});
