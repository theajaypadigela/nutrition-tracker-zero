import type { HealthProfile } from '@/api/types';
import {
  birthYearOf,
  draftFromProfile,
  EMPTY_DRAFT,
  flagged,
  profileInputOf,
  safetyOf,
  type Draft,
} from '@/state/HealthDraft';

const d = (over: Partial<Draft> = {}): Draft => ({ ...EMPTY_DRAFT, ...over });

describe('the safety answers (plan 3.4, 8.1)', () => {
  it('sends the four flags the Worker reads, and nothing about which one fired', () => {
    expect(safetyOf(d({ pregnant: true, medicine: true }))).toEqual({
      pregnantOrBreastfeeding: true,
      eatingDisorder: false,
      clinicianDiet: false,
      dietInteractingMedicine: true,
    });
    expect(safetyOf(d())).toEqual({
      pregnantOrBreastfeeding: false,
      eatingDisorder: false,
      clinicianDiet: false,
      dietInteractingMedicine: false,
    });
  });

  it('treats "none of these" and "I would rather not say" as no flag (Q8)', () => {
    expect(flagged(d({ none: true }))).toBe(false);
    expect(flagged(d({ preferNot: true }))).toBe(false);
    expect(safetyOf(d({ preferNot: true }))).toEqual(safetyOf(d()));
  });

  it('flags only the first three answers; the medicine question never changes what is asked', () => {
    expect([
      flagged(d({ pregnant: true })),
      flagged(d({ eatingDisorder: true })),
      flagged(d({ clinician: true })),
    ]).toEqual([true, true, true]);
    expect(flagged(d({ medicine: true }))).toBe(false);
  });
});

describe('the profile to send, in metric', () => {
  const full = d({
    birthYear: '1996',
    birthMonth: 3,
    sex: 'female',
    height: { unit: 'ftin', cm: '', feet: '5', inches: '3' },
    weight: { unit: 'lb', kg: '', lb: '132', stones: '', stonePounds: '' },
    activity: 'low_active',
    goal: 'lose',
    pace: 'gentle',
    pattern: 'vegan',
  });

  it('converts at once, rounds to a tenth, and carries the choices', () => {
    expect(profileInputOf(full)).toEqual({
      birthYear: 1996,
      birthMonth: 3,
      sexForCalc: 'female',
      heightCm: 160,
      weightKg: 59.9,
      activity: 'low_active',
      goal: 'lose',
      pace: 'gentle',
      pattern: 'vegan',
      referenceSet: 'nasem',
    });
  });

  it('leaves out what is still missing, never sending a guess', () => {
    const input = profileInputOf(d());
    expect(input).not.toHaveProperty('birthYear');
    expect(input).not.toHaveProperty('heightCm');
    expect(input).not.toHaveProperty('weightKg');
    expect(input).not.toHaveProperty('sexForCalc');
    expect(input).not.toHaveProperty('activity');
    expect(input).not.toHaveProperty('numbersHidden'); // left to the server's default
    expect(profileInputOf(d({ numbersHidden: false }))).toHaveProperty('numbersHidden', false);
  });

  it('reads a birth year only when it is four digits', () => {
    expect([
      birthYearOf(d({ birthYear: '1996' })),
      birthYearOf(d({ birthYear: '199' })),
      birthYearOf(d({ birthYear: '' })),
      birthYearOf(d({ birthYear: '19960' })),
    ]).toEqual([1996, null, null, null]);
  });
});

describe('editing an existing profile', () => {
  const profile: HealthProfile = {
    mode: 'personalised',
    birthYear: 1990,
    birthMonth: 6,
    sexForCalc: 'male',
    heightCm: 175,
    weightKg: 82.4,
    activity: 'active',
    goal: 'build_muscle',
    pace: 'standard',
    pattern: 'vegetarian',
    referenceSet: 'nasem',
    dietInteractingMedicine: true,
    numbersHidden: false,
  };

  it('starts from the answers already given, in every unit, with the safety check left to answer again', () => {
    const draft = draftFromProfile(profile);
    expect(draft).toMatchObject({
      consent: true,
      birthYear: '1990',
      birthMonth: 6,
      sex: 'male',
      activity: 'active',
      goal: 'build_muscle',
      pattern: 'vegetarian',
      medicine: true,
      numbersHidden: false,
    });
    expect(draft.height).toMatchObject({ unit: 'cm', cm: '175', feet: '5', inches: '8.9' });
    expect(draft.weight).toMatchObject({ unit: 'kg', kg: '82.4', lb: '181.7' });
    // The safety answers are never stored, so they cannot be pre-filled.
    expect([draft.pregnant, draft.eatingDisorder, draft.clinician, draft.none, draft.preferNot]).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(profileInputOf(draft)).toMatchObject({ heightCm: 175, weightKg: 82.4 });
  });
});
