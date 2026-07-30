import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Feed } from '../../constants/types';
import { FeedWithDistance } from '../../services/feedService';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

interface Props {
  feed: FeedWithDistance;
  selected: boolean;
  onSelect: (feed: Feed) => void;
}

export function FeedCard({ feed, selected, onSelect }: Props) {
  const distanceLabel =
    feed.distanceKm < 1000
      ? `${Math.round(feed.distanceKm)} km away`
      : `${(feed.distanceKm / 1000).toFixed(1)}k km away`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
      onPress={() => onSelect(feed)}
    >
      <View style={styles.left}>
        <View style={[styles.dot, selected ? styles.dotActive : styles.dotInactive]} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{feed.name}</Text>
          <View style={styles.meta}>
            <Text style={styles.agency}>{feed.agency}</Text>
            <Text style={styles.dot2}>·</Text>
            <Text style={styles.city}>{feed.city}, {feed.state}</Text>
          </View>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.distance}>{distanceLabel}</Text>
        {feed.listeners ? (
          <View style={styles.listeners}>
            <MaterialIcons name="headset" size={10} color={Colors.textTertiary} />
            <Text style={styles.listenersText}>{feed.listeners.toLocaleString()}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  selected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDim,
  },
  pressed: {
    opacity: 0.75,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
  dotInactive: {
    backgroundColor: Colors.border,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  agency: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  dot2: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
  city: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  distance: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  listeners: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  listenersText: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
});
