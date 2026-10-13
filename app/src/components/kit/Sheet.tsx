import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '@/hooks/useKeyboard';
import { createStyles, hairline, radius, size, space } from '@/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

const useStyles = createStyles(({ colors }) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: hairline,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingLeft: size.gutter,
    paddingRight: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  headerText: { flex: 1, paddingTop: space.xs, gap: 2 },
  pinned: { paddingHorizontal: size.gutter, paddingBottom: space.md },
  footer: {
    paddingHorizontal: size.gutter,
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
}));

/**
 * A bottom sheet: scrim, a rounded panel, a title and a close button, a scrolling body and an
 * optional fixed footer. It lifts above the keyboard itself, because edge-to-edge Android no
 * longer resizes the window for it.
 *
 * `header` is pinned under the title and does not scroll (a search box above a long list). `tall`
 * makes the sheet as high as the screen allows, instead of as high as its content, so a list that
 * grows and shrinks while typing does not make the sheet jump.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  header,
  footer,
  tall,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  tall?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [panelHeight, setPanelHeight] = useState(480);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 170, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setMounted(false);
        },
      );
    }
  }, [visible, progress]);

  const bottomInset = keyboardHeight > 0 ? 0 : insets.bottom;
  const room = windowHeight - keyboardHeight - insets.top - space.xl;
  // Back with the keyboard up should only put the keyboard away. React Native's Modal listens for
  // the key-up of Back, which can arrive after the keyboard has already consumed the key-down.
  const handleBack = () => (keyboardHeight > 0 ? Keyboard.dismiss() : onClose());

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={handleBack} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root} testID={testID}>
        <Animated.View style={[styles.scrim, { opacity: progress }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          onLayout={e => setPanelHeight(e.nativeEvent.layout.height)}
          style={[
            styles.sheet,
            {
              marginBottom: keyboardHeight,
              ...(tall ? { height: room } : { maxHeight: room }),
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [panelHeight, 0] }) }],
            },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="title3">{title}</Text>
              {subtitle ? (
                <Text variant="small" tone="muted">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} tone="secondary" />
          </View>
          {header ? <View style={styles.pinned}>{header}</View> : null}
          <ScrollView
            style={tall ? { flexShrink: 1, flexGrow: 1 } : { flexShrink: 1 }}
            contentContainerStyle={{
              paddingHorizontal: size.gutter,
              paddingBottom: footer ? space.lg : bottomInset + space.xl,
              gap: space.lg,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { paddingBottom: bottomInset + space.md }]}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}
