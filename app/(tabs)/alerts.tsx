import React, { useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useScanner } from '../../hooks/useScanner';
import { AlertCard, EmptyState } from '../../components';
import { CrimeAlert, AlertSeverity } from '../../constants/types';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

type FilterOption = 'ALL' | AlertSeverity;

const FILTERS: { label: string; value: FilterOption }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'High', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Low', value: 'LOW' },
];

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { crimeAlerts, unreadCount, markAlertRead, markAllRead, clearAlerts } = useScanner();
  const [filter, setFilter] = useState<FilterOption>('ALL');

  const filtered = filter === 'ALL' ? crimeAlerts : crimeAlerts.filter((a) => a.severity === filter);

  const handlePress = (alert: CrimeAlert) => {
    markAlertRead(alert.id);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Crime Alerts</Text>
          <Text style={styles.subtitle}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 ? (
            <Pressable style={styles.actionBtn} onPress={markAllRead}>
              <MaterialIcons name="done-all" size={18} color={Colors.info} />
            </Pressable>
          ) : null}
          {crimeAlerts.length > 0 ? (
            <Pressable style={styles.actionBtn} onPress={clearAlerts}>
              <MaterialIcons name="delete-sweep" size={18} color={Colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Filter Bar */}
      <View style={styles.filterBar}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            style={[styles.filterBtn, filter === f.value && styles.filterBtnActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Alerts List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="notifications-none"
          title="No alerts yet"
          subtitle="Crime keywords detected during scanning will appear here with severity ratings."
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AlertCard alert={item} onPress={handlePress} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 16 },
          ]}
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
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
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
  },
  filterBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnActive: {
    backgroundColor: Colors.primaryDim,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
});
