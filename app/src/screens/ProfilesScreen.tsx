import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import type { Profile } from '@/api/types';
import { Banner, Button, Card, Empty, Field, Loading, Row, Screen, ScrollBody } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useProfile } from '@/state/ProfileContext';

export default function ProfilesScreen() {
  const { selectProfile } = useProfile();
  const { data: profiles, error, loading, reload } = useAsync(() => api.listProfiles(), []);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const pick = async (p: Profile) => {
    await selectProfile(p);
  };

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const p = await api.createProfile(name.trim());
      await selectProfile(p, { isNew: true });
    } catch (e) {
      setCreateError(e instanceof ApiError && e.code === 'name_taken' ? 'That name is taken. Pick it from the list above, or use another name.' : errorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollBody refreshing={loading && !!profiles} onRefresh={reload}>
        <View className="mb-6 mt-8">
          <Text className="text-3xl font-bold text-ink">Nutrition Zero</Text>
          <Text className="mt-2 text-base text-ink-soft">A short voice call each evening logs what you ate.</Text>
        </View>

        <Text className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">Who are you?</Text>
        <Card>
          {error ? <Banner tone="error">{error}</Banner> : null}
          {!profiles && loading ? <Loading /> : null}
          {profiles && profiles.length === 0 ? <Empty title="No profiles yet" body="Create the first one below." /> : null}
          {profiles?.map((p, i) => (
            <Row key={p.id} title={p.name} onPress={() => pick(p)} last={i === profiles.length - 1} right={<Text className="text-brand">Use</Text>} />
          ))}
        </Card>

        <Text className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wider text-ink-muted">New profile</Text>
        <Card>
          <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Asha" autoCapitalize="words" error={createError} testID="profile-name" />
          <Button title="Create profile" onPress={create} loading={creating} disabled={!name.trim()} testID="create-profile" />
        </Card>
      </ScrollBody>
    </Screen>
  );
}
