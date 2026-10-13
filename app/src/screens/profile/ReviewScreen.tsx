import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import { Button, Card, FormGroup, LoadingState, Notice, Text, Toggle } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { HowWeCalculate } from '@/components/health/HowWeCalculate';
import { useAsync } from '@/hooks/useAsync';
import { CONSENT_VERSION, strings } from '@/i18n/strings';
import { useHealth } from '@/state/HealthContext';
import { flagged, profileInputOf, safetyOf, useHealthDraft } from '@/state/HealthDraft';
import { space } from '@/theme';
import { energyLine } from './GoalStepScreen';

const t = strings.health.review;

/**
 * Step 6: what was worked out, with the one-line reason for each number, the hide-numbers switch and Save
 * (WEEKLY_BREAKDOWN_PLAN.md 3.5). For an answer that rules out personal targets there is nothing to preview: it
 * explains that, and Save stores only the mode.
 */
export default function ReviewScreen() {
  const navigation = useNavigation();
  const { draft, update, reset } = useHealthDraft();
  const health = useHealth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);
  const noTargets = flagged(draft);
  const input = useMemo(() => profileInputOf(draft), [draft]);
  const safety = useMemo(() => safetyOf(draft), [draft]);
  const preview = useAsync(() => (noTargets ? Promise.resolve(null) : api.previewTargets(input, safety)), []);
  const set = preview.data;
  const rows = (set?.targets ?? []).filter(x => ['protein', 'fiber', 'sodium'].includes(x.nutrient));
  const labels: Record<string, string> = {
    protein: t.protein,
    fiber: t.fibre,
    sodium: t.sodium,
  };
  const heldBack = set?.inputs && set.inputs.goal !== set.inputs.goalApplied;
  const gateStop = !noTargets && set?.mode === 'reference_only';

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await api.saveHealthProfile({
        profile: input,
        safety,
        consentVersion: CONSENT_VERSION,
      });
      health.apply(r);
      reset();
      if (r.profile.mode === 'reference_only') navigation.navigate('ReferenceOnly');
      else navigation.navigate('Targets');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <StackScreen
      title={t.title}
      subtitle="Step 6"
      footer={
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button
            testID="review-save"
            label={saving ? t.saving : t.save}
            size="lg"
            fullWidth
            loading={saving}
            disabled={!draft.consent || (preview.loading && !noTargets)}
            onPress={save}
          />
        </>
      }
    >
      {noTargets || gateStop ? (
        <Notice tone="info" title={strings.health.referenceOnly.title}>
          {strings.health.referenceOnly.body}
        </Notice>
      ) : (
        <>
          <Text variant="body" tone="secondary">
            {t.lead}
          </Text>
          {preview.error ? <Notice tone="danger">{preview.error}</Notice> : null}
          {preview.loading && !set ? <LoadingState /> : null}
          {set?.energy ? (
            <Card padding="xl" testID="review-energy">
              <Text variant="small" tone="muted">
                {t.energy}
              </Text>
              <Text variant="title2" style={{ marginTop: space.xs }}>
                {energyLine(set)}
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: space.sm }}>
                {t.rangeNote}
              </Text>
            </Card>
          ) : null}
          {rows.map(row => (
            <Card key={row.nutrient}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Text variant="bodyStrong">{labels[row.nutrient]}</Text>
                <Text variant="bodyStrong" tabular>
                  {row.value.toLocaleString('en-US')} {row.unit}
                </Text>
              </View>
              <Text variant="small" tone="secondary" style={{ marginTop: space.xs }}>
                {row.how}
              </Text>
            </Card>
          ))}
          {heldBack ? <Notice tone="info">{t.goalHeld}</Notice> : null}
          {set?.warnings.some(w => w.id === 'underweight_notice') ? (
            <Notice tone="warning">{t.underweight}</Notice>
          ) : null}
          {set?.warnings.some(w => w.id === 'estimates_disagree') ? (
            <Notice tone="info">{t.estimatesDisagree}</Notice>
          ) : null}
          <Button testID="review-how" label={strings.disclaimer.howWeCalculate} variant="soft" onPress={() => setShowHow(v => !v)} />
          {showHow ? <HowWeCalculate referenceSet={draft.referenceSet} /> : null}
        </>
      )}

      <FormGroup hint={t.hideNumbersHint}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text variant="body" style={{ flex: 1 }}>
            {t.hideNumbers}
          </Text>
          <Toggle
            testID="review-hide-numbers"
            value={draft.numbersHidden ?? draft.eatingDisorder}
            onValueChange={v => update({ numbersHidden: v })}
            accessibilityLabel={t.hideNumbers}
          />
        </View>
      </FormGroup>
      <Text variant="caption" tone="muted">
        {strings.disclaimer.full}
      </Text>
    </StackScreen>
  );
}
