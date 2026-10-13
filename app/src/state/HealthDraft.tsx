import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type {
  ActivityLevel,
  DietPattern,
  HealthGoal,
  HealthProfile,
  Pace,
  ProfileInput,
  ReferenceSetId,
  SafetyAnswers,
  SexForCalc,
} from '@/api/types';
import { cmToFeetInches, heightCm, kgToLb, weightKg, type HeightEntry, type WeightEntry } from '@/utils/units';

/**
 * What the person has typed so far in the personal-targets flow (WEEKLY_BREAKDOWN_PLAN.md 3.5). It lives in memory
 * only, across the screens of the flow, and is dropped when the flow ends: nothing is kept until Save.
 */
export interface Draft {
  consent: boolean;
  pregnant: boolean;
  eatingDisorder: boolean;
  clinician: boolean;
  /** "None of these" was chosen explicitly. */
  none: boolean;
  preferNot: boolean;
  medicine: boolean;
  birthYear: string;
  birthMonth: number | null;
  sex: SexForCalc | null;
  height: HeightEntry;
  weight: WeightEntry;
  activity: ActivityLevel | null;
  goal: HealthGoal;
  pace: Pace;
  pattern: DietPattern;
  referenceSet: ReferenceSetId;
  /** null: leave it to the server's default (on after an eating-disorder answer). */
  numbersHidden: boolean | null;
}

export const EMPTY_DRAFT: Draft = {
  consent: false,
  pregnant: false,
  eatingDisorder: false,
  clinician: false,
  none: false,
  preferNot: false,
  medicine: false,
  birthYear: '',
  birthMonth: null,
  sex: null,
  height: { unit: 'cm', cm: '', feet: '', inches: '' },
  weight: { unit: 'kg', kg: '', lb: '', stones: '', stonePounds: '' },
  activity: null,
  goal: 'general_health',
  pace: 'standard',
  pattern: 'omnivore',
  referenceSet: 'nasem',
  numbersHidden: null,
};

/** A draft to edit an existing profile: the answers already given, with the safety check left to answer again (plan 8.1). */
export function draftFromProfile(p: HealthProfile): Draft {
  const ftin = p.heightCm ? cmToFeetInches(p.heightCm) : null;
  return {
    ...EMPTY_DRAFT,
    consent: true,
    medicine: p.dietInteractingMedicine === true,
    birthYear: p.birthYear ? String(p.birthYear) : '',
    birthMonth: p.birthMonth ?? null,
    sex: p.sexForCalc ?? null,
    height: {
      unit: 'cm',
      cm: p.heightCm ? String(Math.round(p.heightCm * 10) / 10) : '',
      feet: ftin ? String(ftin.feet) : '',
      inches: ftin ? String(ftin.inches) : '',
    },
    weight: {
      unit: 'kg',
      kg: p.weightKg ? String(Math.round(p.weightKg * 10) / 10) : '',
      lb: p.weightKg ? String(Math.round(kgToLb(p.weightKg) * 10) / 10) : '',
      stones: '',
      stonePounds: '',
    },
    activity: p.activity ?? null,
    goal: p.goal ?? 'general_health',
    pace: p.pace ?? 'standard',
    pattern: p.pattern ?? 'omnivore',
    referenceSet: p.referenceSet ?? 'nasem',
    numbersHidden: p.numbersHidden ?? null,
  };
}

/** The safety answers as the Worker takes them. "I would rather not say" is the same as "none of these" (plan 3.4, Q8). */
export const safetyOf = (d: Draft): SafetyAnswers => ({
  pregnantOrBreastfeeding: d.pregnant,
  eatingDisorder: d.eatingDisorder,
  clinicianDiet: d.clinician,
  dietInteractingMedicine: d.medicine,
});

/** Any of the first three answers: no personal targets, so no body questions are asked (plan 8.1). */
export const flagged = (d: Draft): boolean => d.pregnant || d.eatingDisorder || d.clinician;

export const birthYearOf = (d: Draft): number | null => {
  const n = Number(d.birthYear);
  return /^\d{4}$/.test(d.birthYear.trim()) && Number.isInteger(n) ? n : null;
};

/** The profile in metric, ready to send; fields still missing are left out. */
export function profileInputOf(d: Draft): ProfileInput {
  const h = heightCm(d.height);
  const w = weightKg(d.weight);
  const by = birthYearOf(d);
  return {
    ...(by !== null ? { birthYear: by } : {}),
    ...(d.birthMonth !== null ? { birthMonth: d.birthMonth } : {}),
    ...(d.sex ? { sexForCalc: d.sex } : {}),
    ...(h !== null ? { heightCm: Math.round(h * 10) / 10 } : {}),
    ...(w !== null ? { weightKg: Math.round(w * 10) / 10 } : {}),
    ...(d.activity ? { activity: d.activity } : {}),
    goal: d.goal,
    pace: d.pace,
    pattern: d.pattern,
    referenceSet: d.referenceSet,
    ...(d.numbersHidden !== null ? { numbersHidden: d.numbersHidden } : {}),
  };
}

interface DraftState {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  reset: (to?: Draft) => void;
}

const Ctx = createContext<DraftState | null>(null);

export function HealthDraftProvider({ children, initial = EMPTY_DRAFT }: { children: React.ReactNode; initial?: Draft }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const update = useCallback((patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch })), []);
  const reset = useCallback((to: Draft = EMPTY_DRAFT) => setDraft(to), []);
  const value = useMemo(() => ({ draft, update, reset }), [draft, update, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHealthDraft(): DraftState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHealthDraft outside HealthDraftProvider');
  return v;
}
