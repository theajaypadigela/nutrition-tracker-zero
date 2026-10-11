import React from 'react';
import { tokens } from '@/theme/tokens';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '../ui/text';
import { ChevronLeft, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useProfile } from '@/state/ProfileContext';

interface AppBarProps {
  title: string;
  subtitle?: string;
  /** Optional right-side action element. No default is rendered. */
  action?: React.ReactNode;
  showProfileShortcut?: boolean;
  showBackButton?: boolean;
  onBackPress?: () => void;
  variant?: 'primary' | 'secondary';
}

/** Up to two initials for the avatar well ("Asha Rao" → "AR"). */
export function initialsOf(name: string | null | undefined): string {
  const trimmedName = name?.trim();
  if (!trimmedName) {
    return '';
  }

  return trimmedName
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');
}

const AppBar: React.FC<AppBarProps> = ({
  title,
  subtitle,
  action,
  showProfileShortcut = false,
  showBackButton = false,
  onBackPress,
  variant = 'primary',
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { profile } = useProfile();
  const safeTop = Math.max(insets.top, 10);
  const isSecondary = variant === 'secondary';
  const profileInitials = React.useMemo(() => initialsOf(profile?.name), [profile?.name]);

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  // Settings lives on the root stack, so the global navigate reaches it from any tab.
  const handleProfilePress = () => navigation.navigate('Settings');

  const resolvedAction =
    action ??
    (showProfileShortcut ? (
      <TouchableOpacity
        onPress={handleProfilePress}
        activeOpacity={0.85}
        style={styles.profileButton}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        {profileInitials ? (
          <Text size="sm" style={styles.profileInitials}>
            {profileInitials}
          </Text>
        ) : (
          <User size={18} color={tokens.dashboard.greenDeep} strokeWidth={2.3} />
        )}
      </TouchableOpacity>
    ) : null);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, { paddingTop: safeTop }]}>
        <View style={styles.row}>
          {showBackButton ? (
            <TouchableOpacity
              onPress={handleBackPress}
              activeOpacity={0.85}
              style={styles.backButton}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <ChevronLeft size={20} color={tokens.dashboard.chevron} strokeWidth={2.4} />
            </TouchableOpacity>
          ) : null}

          <View style={styles.titleRow}>
            {!isSecondary ? <View style={styles.accent} /> : null}

            <View style={styles.titleStack}>
              <Text
                size={isSecondary ? 'xl' : '2xl'}
                style={[styles.title, isSecondary && styles.titleSecondary]}
                numberOfLines={1}
              >
                {title}
              </Text>

              {subtitle ? (
                <Text size="xs" style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>

          {resolvedAction ? (
            <View style={styles.actionSlot}>{resolvedAction}</View>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: tokens.dashboard.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.dashboard.line,
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.dashboard.lineTint,
    backgroundColor: tokens.dashboard.bgTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  accent: {
    width: 4,
    height: 28,
    borderRadius: 2,
    backgroundColor: tokens.dashboard.greenAccent,
    marginRight: 12,
  },
  titleStack: {
    flex: 1,
  },
  title: {
    color: tokens.dashboard.ink,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  titleSecondary: {
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
    color: tokens.dashboard.inkSoft,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  actionSlot: {
    marginLeft: 12,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.dashboard.lineTint,
    backgroundColor: tokens.dashboard.bgTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitials: {
    color: tokens.dashboard.greenDeep,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

export default AppBar;
