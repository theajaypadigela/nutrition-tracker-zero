import React from 'react';
import { View } from 'react-native';
import type { Calibration } from '@/api/types';
import { Badge, Card, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';

const t = strings.report.calibration;

/**
 * EXPERIMENTAL (plan 4.9), shown only when the Worker sends it, which it does only when it is switched on and there are four weeks of mostly
 * complete logs and weigh-ins. It is an estimate nothing has validated, so it says so, says logs run low, and changes no target.
 */
export function CalibrationCard({ calibration }: { calibration: Calibration }) {
  return (
    <Card padding="xl" testID="calibration-card">
      <View style={{ gap: space.sm }}>
        <Badge label={t.title} tone="neutral" />
        <Text variant="body" tabular>
          {fill(t.lead, {
            kcal: calibration.suggestedKcal,
            unc: calibration.uncertaintyKcal,
            current: calibration.currentKcal,
          })}
        </Text>
        <Text variant="small" tone="secondary">
          {t.logsLow} {t.notApplied}
        </Text>
      </View>
    </Card>
  );
}
