import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertSeverity } from '../../constants/types';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

interface Props {
  severity: AlertSeverity;
  small?: boolean;
}

const config: Record<AlertSeverity, { label: string; color: string; bg: string }> = {
  HIGH: { label: 'HIGH', color: Colors.high, bg: Colors.highDim },
  MEDIUM: { label: 'MED', color: Colors.medium, bg: Colors.mediumDim },
  LOW: { label: 'LOW', color: Colors.low, bg: Colors.lowDim },
};

export function StatusBadge({ severity, small = false }: Props) {
  const { label, color, bg } = config[severity];
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: color }, small && styles.small]}>
      <Text style={[styles.text, { color }, small && styles.smallText]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  small: {
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  smallText: {
    fontSize: 10,
  },
});
