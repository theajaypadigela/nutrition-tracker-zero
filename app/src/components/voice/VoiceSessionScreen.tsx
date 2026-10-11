import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tokens } from '@/theme/tokens';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TranscriptLine } from '@/hooks/useVapiCall';
import { callFontFamily } from '@/theme/callTheme';

/** The one assistant name shown on the call surfaces. */
export const ASSISTANT_NAME = 'AI Assistant';

export type CallStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'processing'
  | 'completed'
  | 'error';

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
};

const CONTROLS_BASE_PADDING = 18;

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
  if (status === 'requesting') return 'Connecting...';
  if (status === 'active' && isSpeaking) return 'Speaking...';
  if (status === 'active') return 'Listening...';
  if (status === 'completed') return 'Call ended';
  if (status === 'processing') return 'Finalizing...';
  if (status === 'error') return 'Connection issue';
  return 'Ready';
}

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
}: VoiceSessionScreenProps) {
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(0.75)).current;
  const scrollRef = useRef<ScrollView>(null);
  const shouldAutoScrollRef = useRef(true);
  const [callSeconds, setCallSeconds] = useState(0);

  const parsedMessages = useMemo(
    () => transcript.map(line => ({ role: line.role, isUser: line.role === 'user', text: line.text.trim() })),
    [transcript],
  );

  const callStateLabel = useMemo(
    () => deriveCallStateLabel(status, isSpeaking),
    [status, isSpeaking],
  );

  const primaryButtonLabel =
    status === 'active' ? 'End Call' : status === 'requesting' ? 'Connecting...' : 'Start Call';

  const isActive = status === 'active';
  const isProcessing = status === 'processing';
  const isCompleted = status === 'completed';
  const isError = status === 'error';

  const canShowTimer =
    status === 'active' || status === 'processing' || status === 'completed';

  useEffect(() => {
    if (status === 'active' || status === 'requesting') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.75,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      ).start();
      return;
    }

    pulseAnim.stopAnimation();
    pulseAnim.setValue(0.75);
  }, [status, pulseAnim]);

  useEffect(() => {
    if (status !== 'active') return;

    const interval = setInterval(() => {
      setCallSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  const handleTranscriptScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (layoutMeasurement.height + contentOffset.y);

    // If user scrolls up by more than a small threshold, pause auto-scroll.
    shouldAutoScrollRef.current = distanceFromBottom < 48;
  };

  const handleTranscriptContentSizeChange = () => {
    if (!shouldAutoScrollRef.current) return;
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerIdentityRow}>
              <View style={styles.headerAvatarOuter}>
                <View style={styles.headerAvatarInner} />
              </View>
              <View>
                <Text style={styles.agentTitle}>{ASSISTANT_NAME}</Text>
                <Text style={styles.sessionTitle}>{title}</Text>
              </View>
            </View>
            {canShowTimer && (
              <View style={styles.timerPill}>
                <Text style={styles.timerText}>{formatDuration(callSeconds)}</Text>
              </View>
            )}
          </View>

          <View style={styles.statusRow}>
            <Animated.View
              style={[styles.statusPulse, { transform: [{ scale: pulseAnim }] }]}
            />
            <Text style={styles.statusLabel}>{callStateLabel}</Text>
            <Text style={styles.subtitle}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.transcriptSection}>
          {parsedMessages.length > 0 || outcome ? (
            <ScrollView
              ref={scrollRef}
              style={styles.transcriptScroll}
              contentContainerStyle={styles.transcriptContent}
              onScroll={handleTranscriptScroll}
              onContentSizeChange={handleTranscriptContentSizeChange}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {parsedMessages.map((message, i) => {
                const isUserMessage = message.isUser;

                return (
                  <View
                    key={`${i}-${message.role}`}
                    style={[
                      styles.messageRow,
                      isUserMessage
                        ? styles.messageRowUser
                        : styles.messageRowAssistant,
                    ]}
                  >
                    {isUserMessage ? null : (
                      <View style={styles.messageAssistantAvatar} />
                    )}
                    <View
                      style={[
                        styles.messageBubble,
                        isUserMessage ? styles.userBubble : styles.assistantBubble,
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          isUserMessage
                            ? styles.userMessageText
                            : styles.assistantMessageText,
                        ]}
                      >
                        {message.text || '...'}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {outcome}
            </ScrollView>
          ) : (
            <View style={styles.emptyStateWrap}>
              <Text style={styles.emptyStateTitle}>No transcript yet</Text>
              <Text style={styles.emptyStateBody}>
                Start speaking to begin the conversation.
              </Text>
            </View>
          )}
        </View>

        {isProcessing && (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="small" color={tokens.call.brand} />
            <Text style={styles.processingText}>{processingText}</Text>
          </View>
        )}

        <View style={[styles.controlsBar, { paddingBottom: CONTROLS_BASE_PADDING + insets.bottom }]}>
          {/* No second call from here once one has ended: Done closes the screen. */}
          {!isCompleted && !isError && (
            <TouchableOpacity
              testID="end-call"
              style={[
                styles.primaryButton,
                isActive ? styles.primaryButtonDanger : styles.primaryButtonNeutral,
                disablePrimary && styles.buttonDisabled,
              ]}
              onPress={onPrimaryPress}
              disabled={disablePrimary}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={primaryButtonLabel}
            >
              <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
            </TouchableOpacity>
          )}

          {isError && (
            <TouchableOpacity
              style={styles.warningButton}
              onPress={onRetryPress}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.warningButtonText}>Try Again</Text>
            </TouchableOpacity>
          )}

          {(isCompleted || isError) && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onDonePress}
              accessibilityRole="button"
              accessibilityLabel={doneButtonText}
            >
              <Text style={styles.secondaryButtonText}>{doneButtonText}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.call.background,
  },
  panel: {
    flex: 1,
    width: '100%',
    backgroundColor: tokens.call.surface,
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.call.border,
    backgroundColor: tokens.call.surface,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatarOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.call.surfaceAvatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: tokens.call.brand,
  },
  agentTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.call.textMuted,
    fontFamily: callFontFamily,
  },
  sessionTitle: {
    marginTop: 2,
    fontSize: 21,
    fontWeight: '700',
    color: tokens.call.textPrimary,
    fontFamily: callFontFamily,
  },
  timerPill: {
    backgroundColor: tokens.call.surfaceElevated,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.call.textSecondary,
  },
  statusRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.call.brandSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokens.call.brand,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.call.brand,
  },
  subtitle: {
    fontSize: 12,
    color: tokens.call.textSecondary,
    flexShrink: 1,
  },
  transcriptSection: {
    flex: 1,
    minHeight: 220,
    backgroundColor: tokens.call.background,
  },
  transcriptScroll: {
    flex: 1,
    backgroundColor: tokens.call.background,
  },
  transcriptContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 10,
  },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageAssistantAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.call.surfaceAvatar,
  },
  messageBubble: {
    maxWidth: '72%',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  assistantBubble: {
    backgroundColor: tokens.call.bubbleAssistant,
    borderColor: tokens.call.bubbleAssistantBorder,
    borderTopLeftRadius: 8,
  },
  userBubble: {
    backgroundColor: tokens.call.bubbleUser,
    borderColor: tokens.call.bubbleUserBorder,
    borderTopRightRadius: 8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  assistantMessageText: {
    color: tokens.call.onBubbleAssistant,
  },
  userMessageText: {
    color: tokens.call.onBubbleUser,
    textAlign: 'right',
  },
  emptyStateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.call.textPrimary,
  },
  emptyStateBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.call.textMuted,
    textAlign: 'center',
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.call.border,
    backgroundColor: tokens.call.surfaceElevated,
  },
  processingText: {
    flex: 1,
    fontSize: 13,
    color: tokens.call.textSecondary,
  },
  controlsBar: {
    padding: CONTROLS_BASE_PADDING,
    paddingBottom: CONTROLS_BASE_PADDING,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.call.border,
    backgroundColor: tokens.call.surface,
  },
  primaryButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: tokens.call.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
    elevation: 3,
  },
  primaryButtonNeutral: {
    backgroundColor: tokens.call.brand,
  },
  primaryButtonDanger: {
    backgroundColor: tokens.call.decline,
  },
  primaryButtonText: {
    color: tokens.call.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    width: '100%',
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.call.border,
    backgroundColor: tokens.call.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: tokens.call.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  warningButton: {
    width: '100%',
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: tokens.call.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  warningButtonText: {
    color: tokens.call.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
