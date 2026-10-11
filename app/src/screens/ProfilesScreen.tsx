import React, { useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronRight, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, errorMessage } from '@/api/client';
import type { Profile } from '@/api/types';
import {
  AuthTextField,
  Banner,
  BrandMark,
  Hero,
  PrimaryButton,
  R,
  Wordmark,
} from '@/components/auth';
import { initialsOf } from '@/components/common/AppBar';
import { useAsync } from '@/hooks/useAsync';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import { useProfile } from '@/state/ProfileContext';
import { tokens } from '@/theme/tokens';

/** Pick or create a profile — the old Login screen's hero + sheet, with profiles instead of a password. */
export default function ProfilesScreen() {
  const insets = useSafeAreaInsets();
  const { selectProfile } = useProfile();
  const {
    data: profiles,
    error,
    loading,
    reload,
  } = useAsync(() => api.listProfiles(), []);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Clearance for the Create button under the name field.
  const { keyboardHeight, scrollProps } = useKeyboardAwareScroll(100);

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const p = await api.createProfile(name.trim());
      await selectProfile(p, { isNew: true });
    } catch (e) {
      setCreateError(
        e instanceof ApiError && e.code === 'name_taken'
          ? 'That name is taken. Pick it from the list above, or use another name.'
          : errorMessage(e),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={tokens.auth.greenMid}
      />
      <ScrollView
        {...scrollProps}
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: keyboardHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading && !!profiles}
            onRefresh={reload}
            tintColor={tokens.auth.white}
          />
        }
      >
        <Hero paddingTop={insets.top + 40}>
          <View style={styles.brandRow}>
            <BrandMark size={46} on="dark" />
            <Wordmark color={tokens.auth.white} size={22} />
          </View>
          <Text style={styles.title}>Who's logging?</Text>
          <Text style={styles.subtitle}>
            A short voice call each evening logs what you ate.
          </Text>
        </Hero>

        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 14 },
          ]}
        >
          <View style={styles.fieldStack}>
            <Text style={styles.label}>Choose your profile</Text>
            {error ? (
              <Banner tone="error" title="Couldn't load profiles">
                {error}
              </Banner>
            ) : null}
            {!profiles && loading ? (
              <ActivityIndicator color={tokens.auth.green} />
            ) : null}
            {profiles && profiles.length === 0 ? (
              <Banner tone="info" title="No profiles yet">
                Create the first one below.
              </Banner>
            ) : null}
            {profiles?.map(p => (
              <ProfileRow
                key={p.id}
                profile={p}
                onPress={() => selectProfile(p)}
              />
            ))}
          </View>

          <View style={styles.createBlock}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>New here?</Text>
              <View style={styles.dividerLine} />
            </View>
            <View style={styles.fieldStack}>
              <AuthTextField
                label="Your name"
                icon={User}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Asha"
                autoCapitalize="words"
                error={createError ?? undefined}
                testID="profile-name"
              />
              <PrimaryButton
                onPress={create}
                loading={creating}
                disabled={!name.trim()}
                testID="create-profile"
              >
                {creating ? 'Creating…' : 'Create profile'}
              </PrimaryButton>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** A profile as a tappable field-box row, with the AppBar's initials well. */
function ProfileRow({
  profile,
  onPress,
}: {
  profile: Profile;
  onPress: () => void;
}) {
  return (
    // A static style: NativeWind's Pressable wrapper drops function-form styles.
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use profile ${profile.name}`}
      activeOpacity={0.7}
      style={styles.profileRow}
    >
      <View style={styles.initialsWell}>
        <Text style={styles.initials}>{initialsOf(profile.name)}</Text>
      </View>
      <Text style={styles.profileName} numberOfLines={1}>
        {profile.name}
      </Text>
      <ChevronRight size={20} color={tokens.auth.inkMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.auth.greenMid },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, backgroundColor: tokens.auth.bg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    color: tokens.auth.white,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 26,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 300,
  },
  sheet: {
    flex: 1,
    marginTop: -46,
    backgroundColor: tokens.auth.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    paddingHorizontal: 22,
    paddingTop: 26,
  },
  fieldStack: { gap: 14 },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: tokens.auth.ink,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.6,
    borderColor: tokens.auth.line,
    backgroundColor: tokens.auth.field,
    borderRadius: R.md,
    paddingHorizontal: 12,
    height: 58,
  },
  initialsWell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: tokens.auth.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.auth.greenDeep,
    letterSpacing: 0.3,
  },
  profileName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: tokens.auth.ink,
    letterSpacing: -0.2,
  },
  createBlock: { marginTop: 26 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: tokens.auth.line },
  dividerText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.auth.inkMuted,
    letterSpacing: 0.4,
  },
});
