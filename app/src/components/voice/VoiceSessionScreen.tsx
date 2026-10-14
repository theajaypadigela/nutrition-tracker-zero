import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Mic, Phone, PhoneOff, RotateCw } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState, LEAF_PATH, Text } from '@/components/kit';
import type { TranscriptLine } from '@/services/voice/types';
import type { AudioRoute, CallAudioState } from '@/services/calls/audioRoute';
import { createStyles, FocusAwareStatusBar, hairline, radius, size, space, useTheme } from '@/theme';
import { AudioRouteControl } from './AudioRouteControl';

export type CallStatus = 'idle' | 'requesting' | 'active' | 'processing' | 'completed' | 'error';

type VoiceSessionScreenProps = {
  title: string;
  statusText: string;
  status: CallStatus;
  isSpeaking: boolean;
  transcript: TranscriptLine[];
  onPrimaryPress: () => void;
  onDonePress: () => void;
  onRetryPress: () => void;
  disablePrimary: boolean;
  processingText: string;
  doneButtonText: string;
  /** What the call saved, shown under the transcript once the call is over. */
  outcome?: React.ReactNode;
  /** Where the call plays and what else it can play through, while it is live. */
  audio?: CallAudioState | null;
  onSelectAudioRoute?: (route: AudioRoute) => void;
  /** The phone is at the ear on the earpiece: cover the screen and swallow touches (a cheek must not end the call). */
  shielded?: boolean;
};

/** The cover while the phone is at the ear. Black whatever the theme: it stands for a screen that is off. */
const SCREEN_OFF = '#000000';

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function deriveCallStateLabel(status: CallStatus, isSpeaking: boolean): string {
  if (status === 'requesting') return 'Connecting…';
  if (status === 'active' && isSpeaking) return 'Speaking…';
  if (status === 'active') return 'Listening…';
  if (status === 'completed') return 'Call ended';
  if (status === 'processing') return 'Finalizing…';
  if (status === 'error') return 'Connection issue';
  return 'Ready';
}

const AVATAR = 52;

const useStyles = createStyles(({ colors }) => ({
  header: {
    paddingHorizontal: size.gutter,
    paddingBottom: space.lg,
    gap: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatarBox: { width: AVATAR, height: AVATAR, alignItems: 'center', justifyContent: 'center' },
  avatarRipple: {
    position: 'absolute',
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptContent: { paddingHorizontal: size.gutter, paddingTop: space.xl, paddingBottom: space.xl, gap: space.lg },
  assistantRow: { maxWidth: '92%', alignSelf: 'flex-start' },
  userRow: { maxWidth: '84%', alignSelf: 'flex-end' },
  userBubble: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl - 2,
    borderBottomRightRadius: 6,
    paddingHorizontal: space.lg - 2,
    paddingVertical: space.md,
  },
  processing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: size.gutter,
    paddingVertical: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  controls: {
    paddingHorizontal: size.gutter,
    paddingTop: space.md,
    gap: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
}));

/** The assistant: the brand leaf on a soft green disc, with a ring that ripples while the call is live. */
function AssistantAvatar({ live }: { live: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const ripple = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live) {
      ripple.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.timing(ripple, { toValue: 1, duration: 1700, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [live, ripple]);

  return (
    <View style={styles.avatarBox}>
      {live ? (
        <Animated.View
          style={[
            styles.avatarRipple,
            {
              opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }) }],
            },
          ]}
        />
      ) : null}
      <View style={styles.avatar}>
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path d={LEAF_PATH} fill={colors.primary} />
        </Svg>
      </View>
    </View>
  );
}

/**
 * The voice check-in: who is on the line and what state the call is in, the live transcript, and
 * one action at the bottom (start, end, try again, done). It follows the app's light or dark theme.
 */
export default function VoiceSessionScreen({
  title,
  statusText,
  status,
  isSpeaking,
  transcript,
  onPrimaryPress,
  onDonePress,
  onRetryPress,
  disablePrimary,
  processingText,
  doneButtonText,
  outcome,
  audio,
  onSelectAudioRoute,
  shielded,
}: VoiceSessionScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const scrollRef = useRef<ScrollView>(null);
  const shouldAutoScrollRef = useRef(true);
  const [callSeconds, setCallSeconds] = useState(0);

  const messages = useMemo(
    () => transcript.map(line => ({ isUser: line.role === 'user', text: line.text.trim() })),
    [transcript],
  );
  const stateLabel = useMemo(() => deriveCallStateLabel(status, isSpeaking), [status, isSpeaking]);

  const isActive = status === 'active';
  const isProcessing = status === 'processing';
  const isCompleted = status === 'completed';
  const isError = status === 'error';
  const live = isActive || status === 'requesting';
  const showTimer = isActive || isProcessing || isCompleted;
  const primaryLabel = isActive ? 'End call' : status === 'requesting' ? 'Connecting…' : 'Start call';

  useEffect(() => {
    if (status !== 'active') return undefined;
    const interval = setInterval(() => setCallSeconds(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    // If the user scrolls up by more than a small threshold, pause auto-scroll.
    shouldAutoScrollRef.current = contentSize.height - (layoutMeasurement.height + contentOffset.y) < 48;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FocusAwareStatusBar />
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <View style={styles.headerRow}>
          <AssistantAvatar live={live} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title3">{title}</Text>
            <Text variant="smallStrong" tone={isError ? 'warning' : 'primary'}>
              {stateLabel}
            </Text>
          </View>
          {showTimer ? (
            <Text variant="bodyStrong" tone="secondary" tabular>
              {formatDuration(callSeconds)}
            </Text>
          ) : null}
        </View>
        <Text variant="small" tone="muted">
          {statusText}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        {messages.length > 0 || outcome ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.transcriptContent}
            onScroll={handleScroll}
            onContentSizeChange={() => shouldAutoScrollRef.current && scrollRef.current?.scrollToEnd({ animated: true })}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {messages.map((m, i) =>
              m.isUser ? (
                <View key={`${i}-user`} style={styles.userRow}>
                  <View style={styles.userBubble}>
                    <Text variant="body">{m.text || '…'}</Text>
                  </View>
                </View>
              ) : (
                <View key={`${i}-assistant`} style={styles.assistantRow}>
                  <Text variant="body">{m.text || '…'}</Text>
                </View>
              ),
            )}
            {outcome}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState icon={Mic} title="No transcript yet" body="Start speaking to begin the conversation." />
          </View>
        )}
      </View>

      {isProcessing ? (
        <View style={styles.processing}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="small" tone="secondary" style={{ flex: 1 }}>
            {processingText}
          </Text>
        </View>
      ) : null}

      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, space.md) + space.xs }]}>
        {isActive && audio && onSelectAudioRoute ? <AudioRouteControl state={audio} onSelect={onSelectAudioRoute} /> : null}

        {/* No second call from here once one has ended: Done closes the screen. */}
        {!isCompleted && !isError ? (
          <Button
            testID="end-call"
            label={primaryLabel}
            icon={isActive ? PhoneOff : Phone}
            variant={isActive ? 'danger' : 'primary'}
            size="lg"
            fullWidth
            loading={status === 'requesting'}
            disabled={disablePrimary}
            onPress={onPrimaryPress}
          />
        ) : null}

        {isError ? <Button label="Try again" icon={RotateCw} size="lg" fullWidth onPress={onRetryPress} /> : null}

        {isCompleted || isError ? (
          <Button label={doneButtonText} variant={isCompleted ? 'primary' : 'secondary'} size="lg" fullWidth onPress={onDonePress} />
        ) : null}
      </View>

      {shielded ? (
        <View
          testID="proximity-shield"
          style={[StyleSheet.absoluteFill, { backgroundColor: SCREEN_OFF }]}
          onStartShouldSetResponder={() => true}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  );
}
