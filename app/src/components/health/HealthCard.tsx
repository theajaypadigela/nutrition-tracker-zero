import React from 'react';
import { View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import { Button, Card, Icon, Text } from '@/components/kit';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';

/** "Make your targets personal (about 2 minutes)": dismissible, shown on Today and Report to profiles without a health profile (plan 3.6). */
export function HealthCard({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  const t = strings.health.card;
  return (
    <Card testID="health-card">
      <View
        style={{
          flexDirection: 'row',
          gap: space.md,
          alignItems: 'flex-start',
        }}
      >
        <Icon as={UserRound} size="lg" tone="primary" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{t.title}</Text>
          <Text variant="small" tone="secondary">
            {t.body}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <Button label={t.action} size="sm" onPress={onStart} />
        <Button label={t.dismiss} size="sm" variant="ghost" onPress={onDismiss} />
      </View>
    </Card>
  );
}
