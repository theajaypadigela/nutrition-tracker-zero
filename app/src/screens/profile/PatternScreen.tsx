import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { DietPattern, ReferenceSetId } from '@/api/types';
import { Button, FormGroup, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { ChoiceCard } from '@/components/health/ChoiceCard';
import { strings } from '@/i18n/strings';
import { useHealthDraft } from '@/state/HealthDraft';
import { FALLBACK_META, useMeta } from '@/state/MetaContext';
import { space } from '@/theme';

const t = strings.health.pattern;
const PATTERNS: DietPattern[] = ['omnivore', 'pescatarian', 'eggetarian', 'vegetarian', 'vegan'];

/** Step 5: how the person eats (which nutrients to watch) and which reference tables to read (plan 3.2). */
export default function PatternScreen() {
  const navigation = useNavigation();
  const { draft, update } = useHealthDraft();
  const meta = useMeta();
  const sets = meta.referenceSets ?? FALLBACK_META.referenceSets ?? [];

  return (
    <StackScreen
      title={t.title}
      subtitle="Step 5"
      footer={
        <Button
          testID="pattern-continue"
          label={t.continue}
          size="lg"
          fullWidth
          onPress={() => navigation.navigate('HealthReview')}
        />
      }
    >
      <Text variant="body" tone="secondary">
        {t.lead}
      </Text>
      <View style={{ gap: space.md }}>
        {PATTERNS.map(p => (
          <ChoiceCard
            key={p}
            testID={`pattern-${p}`}
            title={t[p]}
            selected={draft.pattern === p}
            onPress={() => update({ pattern: p })}
          />
        ))}
      </View>
      <FormGroup title={t.referenceTitle} hint={t.referenceHint}>
        <View style={{ gap: space.md }}>
          {sets.map(s => (
            <ChoiceCard
              key={s.id}
              testID={`reference-${s.id}`}
              title={s.label}
              body={s.available ? (t.referenceNotes as Record<string, string>)[s.id] : t.soon}
              selected={draft.referenceSet === s.id}
              disabled={!s.available}
              onPress={() => update({ referenceSet: s.id as ReferenceSetId })}
            />
          ))}
        </View>
      </FormGroup>
    </StackScreen>
  );
}
