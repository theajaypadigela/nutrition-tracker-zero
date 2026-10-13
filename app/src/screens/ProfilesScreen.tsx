import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { ChevronRight, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, errorMessage } from '@/api/client';
import type { Profile } from '@/api/types';
import { Avatar, BrandMark, Button, Card, Field, FormGroup, Icon, ListGroup, LoadingState, Notice, Text } from '@/components/kit';
import { StatusBarScrim } from '@/components/layout/StatusBarScrim';
import { useAsync } from '@/hooks/useAsync';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import { useProfile } from '@/state/ProfileContext';
import { createStyles, FocusAwareStatusBar, size, space, useTheme } from '@/theme';
import { initialsOf } from '@/utils/format';

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.lg, paddingVertical: space.md },
}));

/** Pick or create a profile. There is no password: the profile is the sign-in. */
export default function ProfilesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { selectProfile } = useProfile();
  const { data: profiles, error, loading, reload } = useAsync(() => api.listProfiles(), []);
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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FocusAwareStatusBar />
      <ScrollView
        {...scrollProps}
        contentContainerStyle={{
          padding: size.gutter,
          paddingTop: insets.top + space.xxxl,
          paddingBottom: Math.max(insets.bottom, space.lg) + keyboardHeight + space.xxl,
          gap: space.xxl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading && !!profiles} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        <View style={{ gap: space.xl }}>
          <BrandMark size={52} />
          <View style={{ gap: space.sm }}>
            <Text variant="title1">Who's logging?</Text>
            <Text variant="body" tone="secondary">
              A short voice call each evening logs what you ate.
            </Text>
          </View>
        </View>

        <FormGroup title="Choose your profile">
          {error ? <Notice tone="danger" title="Couldn't load profiles">{error}</Notice> : null}
          {!profiles && loading ? <LoadingState /> : null}
          {profiles && profiles.length === 0 ? (
            <Notice tone="info" title="No profiles yet">
              Create the first one below.
            </Notice>
          ) : null}
          {profiles && profiles.length > 0 ? (
            <ListGroup>
              {profiles.map(p => (
                <ProfileRow key={p.id} profile={p} onPress={() => selectProfile(p)} />
              ))}
            </ListGroup>
          ) : null}
        </FormGroup>

        <FormGroup title="New here?">
          <Card>
            <View style={{ gap: space.lg }}>
              <Field
                label="Your name"
                icon={User}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Asha"
                autoCapitalize="words"
                error={createError}
                testID="profile-name"
              />
              <Button
                testID="create-profile"
                label={creating ? 'Creating…' : 'Create profile'}
                size="lg"
                fullWidth
                loading={creating}
                disabled={!name.trim()}
                onPress={create}
              />
            </View>
          </Card>
        </FormGroup>
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

function ProfileRow({ profile, onPress }: { profile: Profile; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use profile ${profile.name}`}
      android_ripple={{ color: colors.ripple }}
      style={styles.row}
    >
      <Avatar initials={initialsOf(profile.name)} size={40} />
      <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
        {profile.name}
      </Text>
      <Icon as={ChevronRight} size="sm" tone="faint" />
    </Pressable>
  );
}
