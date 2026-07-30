import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CrimeAlert } from '../../constants/types';
import { StatusBadge } from '../ui/StatusBadge';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

interface Props {
  alert: CrimeAlert;
  onPress: (alert: CrimeAlert) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AlertCard({ alert, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        !alert.read && styles.unread,
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(alert)}
    >
      <View style={styles.header}>
        <StatusBadge severity={alert.severity} />
        <Text style={styles.time}>{formatTime(alert.timestamp)}</Text>
        {!alert.read ? <View style={styles.unreadDot} /> : null}
      </View>

      <Text style={styles.keyword}>
        <MaterialIcons name="warning" size={13} color={
          alert.severity === 'HIGH' ? Colors.high :
          alert.severity === 'MEDIUM' ? Colors.medium : Colors.low
        } /> {alert.matchedKeyword.toUpperCase()}
      </Text>

      <Text style={styles.transcript} numberOfLines={2}>
        {alert.transcription}
      </Text>

      <View style={styles.footer}>
        <MaterialIcons name="radio" size={12} color={Colors.textTertiary} />
        <Text style={styles.agency}>{alert.agency}</Text>
        <MaterialIcons name="location-on" size={12} color={Colors.textTertiary} />
        <Text style={styles.location}>{alert.location}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    gap: 8,
  },
  unread: {
    borderColor: Colors.primaryBright,
    backgroundColor: Colors.cardElevated,
  },
  pressed: { opacity: 0.8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  time: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  keyword: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  transcript: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  agency: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginRight: 6,
  },
  location: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
});
