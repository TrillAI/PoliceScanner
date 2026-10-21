import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useScanner } from '../../hooks/useScanner';
import { useGeolocation } from '../../hooks/useGeolocation';
import { getAllFeedsWithDistance, FeedWithDistance } from '../../services/feedService';
import { FeedCard, WaveAnimation } from '../../components';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const geo = useGeolocation();
  const { selectedFeed, streamStatus, selectFeed, startStream, stopStream, setUserLocation } = useScanner();
  const [feeds, setFeeds] = useState<FeedWithDistance[]>([]);

  useEffect(() => {
    if (geo.latitude !== null && geo.longitude !== null) {
      setUserLocation(geo.latitude, geo.longitude);
      setFeeds(getAllFeedsWithDistance(geo.latitude, geo.longitude));
    } else {
      // Default: use San Francisco coordinates
      setFeeds(getAllFeedsWithDistance(37.7749, -122.4194));
    }
  }, [geo.latitude, geo.longitude, setUserLocation]);

  const isPlaying = streamStatus === 'playing';
  const isLoading = streamStatus === 'loading';
  const isError = streamStatus === 'error';

  const handleToggleStream = async () => {
    if (!selectedFeed) return;
    if (isPlaying) {
      await stopStream();
    } else {
      await startStream();
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/scanner-icon.png')}
          style={styles.logo}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.headerText}>
          <Text style={styles.title}>Police Scanner</Text>
          <View style={styles.locationRow}>
            <MaterialIcons
              name={geo.loading ? 'gps-not-fixed' : geo.error ? 'gps-off' : 'gps-fixed'}
              size={12}
              color={geo.error ? Colors.warning : Colors.success}
            />
            <Text style={styles.location}>{geo.cityLabel}</Text>
          </View>
        </View>
        {isPlaying ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : null}
      </View>

      {/* Now Playing Card */}
      {selectedFeed ? (
        <View style={[styles.nowPlaying, isPlaying && styles.nowPlayingActive]}>
          <View style={styles.nowPlayingLeft}>
            <WaveAnimation active={isPlaying} color={isPlaying ? Colors.primary : Colors.textTertiary} />
            <View style={styles.nowPlayingInfo}>
              <Text style={styles.nowPlayingName} numberOfLines={1}>{selectedFeed.name}</Text>
              <Text style={styles.nowPlayingAgency}>{selectedFeed.agency} · {selectedFeed.city}</Text>
              {isError ? (
                <Text style={styles.demoNote}>⚡ Demo mode — live stream needs Broadcastify auth</Text>
              ) : isPlaying ? (
                <Text style={styles.demoNote}>🎙 Monitoring chatter (demo transcription)</Text>
              ) : null}
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.playBtn,
              isPlaying ? styles.playBtnStop : styles.playBtnPlay,
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleToggleStream}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons
                name={isPlaying ? 'stop' : 'play-arrow'}
                size={26}
                color="#fff"
              />
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.noFeedHint}>
          <MaterialIcons name="touch-app" size={18} color={Colors.textTertiary} />
          <Text style={styles.noFeedText}>Select a feed below to start listening</Text>
        </View>
      )}

      {/* Feed List */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {geo.latitude !== null ? 'Feeds Nearest You' : 'All Feeds'}
        </Text>
        <Text style={styles.sectionCount}>{feeds.length} channels</Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {feeds.map((feed) => (
          <FeedCard
            key={feed.id}
            feed={feed}
            selected={selectedFeed?.id === feed.id}
            onSelect={selectFeed}
          />
        ))}
      </ScrollView>
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
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  headerText: { flex: 1 },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  location: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 1,
  },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  nowPlayingActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDim,
  },
  nowPlayingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nowPlayingInfo: { flex: 1 },
  nowPlayingName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  nowPlayingAgency: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  demoNote: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 3,
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  playBtnPlay: { backgroundColor: Colors.primary },
  playBtnStop: { backgroundColor: '#333' },
  noFeedHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  noFeedText: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionCount: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
});
