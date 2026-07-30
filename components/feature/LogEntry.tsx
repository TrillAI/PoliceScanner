import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LogEntry as LogEntryType } from '../../constants/types';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

interface Props {
  entry: LogEntryType;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const typeColors: Record<string, string> = {
  system: Colors.info,
  transcription: Colors.textSecondary,
  alert: Colors.warning,
};

const typeBg: Record<string, string> = {
  system: 'rgba(10,132,255,0.1)',
  transcription: Colors.card,
  alert: 'rgba(255,149,0,0.08)',
};

export function LogEntry({ entry }: Props) {
  return (
    <View style={[styles.row, { backgroundColor: typeBg[entry.type] ?? Colors.card }]}>
      <Text style={styles.time}>{formatTimestamp(entry.timestamp)}</Text>
      <View style={styles.body}>
        <Text style={[styles.typeTag, { color: typeColors[entry.type] ?? Colors.textSecondary }]}>
          {entry.type.toUpperCase()}
        </Text>
        <Text style={styles.agency}>{entry.agency}</Text>
        <Text style={styles.text}>{entry.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  time: {
    fontSize: 11,
    color: Colors.textTertiary,
    width: 62,
    flexShrink: 0,
    marginTop: 2,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  typeTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  agency: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  text: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
