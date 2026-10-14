import React, { useCallback, useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, LoadingState, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { useAsync } from '@/hooks/useAsync';
import { buildHealthReport, type HealthItem, type HealthStatus } from '@/services/calls/health';
import { readNativeReminderDiagnostics } from '@/services/calls/native';
import { createStyles, radius, space, useTheme } from '@/theme';

const STATUS_LABEL: Record<HealthStatus, string> = {
  ok: 'OK',
  warn: 'Needs attention',
  error: 'Action required',
};

const useStyles = createStyles(() => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
}));

/** Whether the daily call can actually ring on time: each requirement, its state, and a fix. */
export default function ReminderHealthScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const report = useAsync(() => buildHealthReport(), []);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      report.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const runFix = async (item: HealthItem) => {
    setBusyId(item.id);
    try {
      await item.fix?.run();
    } finally {
      setBusyId(null);
    }
  };

  const degraded = report.data?.some(item => item.status !== 'ok');
  const statusColor: Record<HealthStatus, string> = { ok: colors.primary, warn: colors.warning, error: colors.danger };

  return (
    <StackScreen
      title="Reminder health"
      subtitle="Can your daily call ring on time?"
      refreshing={report.loading && !!report.data}
      onRefresh={report.reload}
    >
      {report.loading && !report.data ? <LoadingState /> : null}

      {report.data ? (
        degraded ? (
          <Notice tone="warning">The daily call may be late or silent. Fix the items marked below.</Notice>
        ) : (
          <Notice tone="success">Reminder permissions are ready. Check the delivery details below.</Notice>
        )
      ) : null}

      {report.data?.map(item => (
        <Card key={item.id}>
          <View style={styles.head}>
            <View style={[styles.dot, { backgroundColor: statusColor[item.status] }]} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {item.title}
            </Text>
            <Text variant="smallStrong" tone={item.status === 'ok' ? 'primary' : item.status === 'warn' ? 'warning' : 'danger'}>
              {STATUS_LABEL[item.status]}
            </Text>
          </View>
          <Text variant="small" tone="secondary" style={{ marginTop: space.sm }}>
            {item.detail}
          </Text>
          {item.fix ? (
            <View style={{ marginTop: space.lg }}>
              <Button
                label={busyId === item.id ? 'Opening…' : item.fix.label}
                variant="soft"
                fullWidth
                disabled={busyId === item.id}
                onPress={() => runFix(item)}
              />
            </View>
          ) : null}
        </Card>
      ))}
      {Platform.OS === 'android' ? <Button label="Share delivery diagnostics" variant="soft" onPress={async () => {
        try {
          const diagnostics = await readNativeReminderDiagnostics();
          await Share.share({ title: 'Reminder delivery diagnostics', message: diagnostics
            ? JSON.stringify(diagnostics, null, 2) : 'Native reminder diagnostics are missing. Install the rebuilt APK.' });
        } catch {
          Alert.alert('Could not read delivery diagnostics', 'Open Reminder health again and try sharing the delivery details.');
        }
      }} /> : null}
    </StackScreen>
  );
}
