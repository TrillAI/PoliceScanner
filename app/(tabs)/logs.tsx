import React, { useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useScanner } from '../../hooks/useScanner';
import { LogEntry, EmptyState } from '../../components';
import { LogEntry as LogEntryType } from '../../constants/types';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

type LogFilter = 'all' | 'transcription' | 'alert' | 'system';

const FILTERS: { label: string; value: LogFilter; icon: string }[] = [
  { label: 'All', value: 'all', icon: 'list' },
  { label: 'Chatter', value: 'transcription', icon: 'mic' },
  { label: 'Alerts', value: 'alert', icon: 'warning' },
  { label: 'System', value: 'system', icon: 'settings' },
];

export default function LogsScreen() {
  const insets = useSafeAreaInsets();
  const { logEntries, clearLogs, transcriptionMode } = useScanner();
  const [filter, setFilter] = useState<LogFilter>('all');

  const filtered =
    filter === 'all' ? logEntries : logEntries.filter((e) => e.type === filter);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Activity Log</Text>
          <Text style={styles.subtitle}>{logEntries.length} entries recorded</Text>
        </View>
        {logEntries.length > 0 ? (
          <Pressable style={styles.clearBtn} onPress={clearLogs}>
            <MaterialIcons name="delete-sweep" size={18} color={Colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            style={[styles.filterBtn, filter === f.value && styles.filterBtnActive]}
            onPress={() => setFilter(f.value)}
          >
            <MaterialIcons
              name={f.icon as any}
              size={13}
              color={filter === f.value ? Colors.gold : Colors.textTertiary}
            />
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <MaterialIcons name="info-outline" size={14} color={Colors.info} />
        <Text style={styles.infoText}>
          {transcriptionMode === 'live'
            ? 'Live transcription from the radio server. Transmissions appear a few seconds after they end.'
            : 'Transcription runs in demo mode. Set EXPO_PUBLIC_TRANSCRIBER_URL to use live transcription.'}
        </Text>
      </View>

      {/* Log List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="subject"
          title="No log entries"
          subtitle="Start a scanner feed and activity will be recorded here in real time."
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LogEntry entry={item} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  filterBtnActive: {
    backgroundColor: Colors.goldDim,
    borderColor: Colors.gold,
  },
  filterText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: Colors.gold,
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    backgroundColor: 'rgba(10,132,255,0.08)',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(10,132,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.info,
    lineHeight: 17,
  },
});
