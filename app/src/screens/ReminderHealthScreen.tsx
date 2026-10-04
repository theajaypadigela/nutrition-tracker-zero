import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, Loading, Screen, ScrollBody } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { buildHealthReport, type HealthStatus } from '@/services/calls/health';

const DOT: Record<HealthStatus, string> = { ok: 'bg-brand', warn: 'bg-warn', error: 'bg-danger' };

export default function ReminderHealthScreen() {
  const report = useAsync(() => buildHealthReport(), []);
  useFocusEffect(
    useCallback(() => {
      report.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  return (
    <Screen edges={['bottom']}>
      <ScrollBody refreshing={report.loading && !!report.data} onRefresh={report.reload}>
        <Text className="mb-3 mt-2 text-sm text-ink-soft">Everything here should be green for the daily call to ring reliably.</Text>
        {!report.data ? <Loading /> : null}
        {report.data?.map((item) => (
          <Card key={item.id}>
            <View className="flex-row items-center">
              <View className={`mr-2 h-2.5 w-2.5 rounded-full ${DOT[item.status]}`} />
              <Text className="flex-1 text-base font-semibold text-ink">{item.title}</Text>
            </View>
            <Text className="mt-1 text-sm text-ink-soft">{item.detail}</Text>
            {item.fix ? <Button small variant="secondary" title={item.fix.label} className="mt-2 self-start" onPress={() => item.fix!.run()} /> : null}
          </Card>
        ))}
      </ScrollBody>
    </Screen>
  );
}
