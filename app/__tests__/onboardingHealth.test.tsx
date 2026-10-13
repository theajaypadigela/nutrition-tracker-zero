/**
 * The personal-targets flow (WEEKLY_BREAKDOWN_PLAN.md 3.5, 8.1, 11.10): the steps, the gates and the unit conversion.
 * Screens are rendered with the navigator, the API and the contexts replaced, and driven through their props.
 */
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn(), dispatch: jest.fn() };
  // As React Navigation builds it.
  const CommonActions = { reset: (state: object) => ({ type: 'RESET', payload: state }) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: () => ({ params: {} }), useFocusEffect: jest.fn(), CommonActions, __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/api/client', () => {
  // Plain assignments, not parameter properties: a jest.mock factory may not reference Babel's helpers.
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
  return { ApiError, errorMessage, setApiSecret: jest.fn(), api: { previewTargets: jest.fn(), saveHealthProfile: jest.fn(), claimSecret: jest.fn(), getHealthProfile: jest.fn(), meta: jest.fn() } };
});
jest.mock('@/state/ProfileContext', () => ({ useProfile: jest.fn() }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));

import { api, ApiError } from '@/api/client';
import type { TargetSetInfo } from '@/api/types';
import ActivityScreen from '@/screens/profile/ActivityScreen';
import AboutYouScreen from '@/screens/profile/AboutYouScreen';
import GoalStepScreen from '@/screens/profile/GoalStepScreen';
import PatternScreen from '@/screens/profile/PatternScreen';
import HealthIntroScreen from '@/screens/profile/HealthIntroScreen';
import ReviewScreen from '@/screens/profile/ReviewScreen';
import SafetyCheckScreen from '@/screens/profile/SafetyCheckScreen';
import { Under19Screen } from '@/screens/profile/EndScreens';
import { CONSENT_VERSION } from '@/i18n/strings';
import { useHealth } from '@/state/HealthContext';
import { FALLBACK_META, MetaProvider } from '@/state/MetaContext';
import { EMPTY_DRAFT, HealthDraftProvider, profileInputOf, useHealthDraft, type Draft } from '@/state/HealthDraft';
import { useProfile } from '@/state/ProfileContext';
import { ThemeProvider } from '@/theme';

const nav = (jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock> }).__nav;
const api_ = api as unknown as Record<string, jest.Mock>;

/**
 * The screens left in the stack after the last `dispatch` (a reset that takes the flow off the stack), for a stack of
 * `names` from the bottom up.
 */
const stackAfter = (names: string[]) => {
  const update = nav.dispatch!.mock.calls.at(-1)![0] as (state: object) => { payload: { routes: { name: string }[]; index: number } };
  const routes = names.map((name, i) => ({ name, key: `${name}-${i}` }));
  const action = update({ type: 'stack', key: 'root', stale: false, index: routes.length - 1, routeNames: names, routes });
  expect(action.payload.index).toBe(action.payload.routes.length - 1);
  return action.payload.routes.map(r => r.name);
};
const FLOW = ['HealthIntro', 'SafetyCheck', 'AboutYou', 'Activity', 'HealthGoal', 'Pattern', 'HealthReview'];

/** The draft, as the screens leave it, readable from the test. */
let current!: ReturnType<typeof useHealthDraft>;
function Probe() {
  current = useHealthDraft();
  return null;
}

/** Renders a screen with the draft already holding `seed`, as it does when a person reaches it in the app. */
async function render(ui: React.ReactElement, seed?: Partial<Draft>) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <HealthDraftProvider initial={{ ...EMPTY_DRAFT, ...seed }}>
          <Probe />
          {ui}
        </HealthDraftProvider>
      </ThemeProvider>,
    );
  });
  return tree;
}

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const withId = (tree: TestRenderer.ReactTestRenderer, id: string, prop: string) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.props[prop] === 'function')[0];
/**
 * The Pressable a button or card renders: the node with this testID that has an accessibility role. (The component around
 * it has the same testID and onPress, but only the Pressable's onPress is dropped while the control is disabled.)
 */
const pressable = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.type !== 'string' && n.props.accessibilityRole !== undefined)[0];
const press = async (tree: TestRenderer.ReactTestRenderer, id: string) => {
  const node = pressable(tree, id);
  if (!node || typeof node.props.onPress !== 'function') throw new Error(`nothing pressable (or it is disabled) with testID ${id}`);
  await act(async () => { node.props.onPress(); });
};
const valueOf = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && n.props.value !== undefined)[0]!.props.value;
const type = async (tree: TestRenderer.ReactTestRenderer, id: string, text: string) => {
  const node = withId(tree, id, 'onChangeText');
  if (!node) throw new Error(`no input with testID ${id}`);
  await act(async () => { node.props.onChangeText(text); });
};
const enabled = (tree: TestRenderer.ReactTestRenderer, id: string) => typeof pressable(tree, id)?.props.onPress === 'function';
const texts = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));

const ADULT: Partial<Draft> = { birthYear: String(new Date().getFullYear() - 35), sex: 'female', height: { unit: 'cm', cm: '165', feet: '', inches: '' }, weight: { unit: 'kg', kg: '62', lb: '', stones: '', stonePounds: '' } };

beforeEach(() => {
  jest.clearAllMocks();
  (useProfile as jest.Mock).mockReturnValue({ secret: 's'.repeat(43), adoptSecret: jest.fn() });
  (useHealth as jest.Mock).mockReturnValue({ profile: null, apply: jest.fn(), refresh: jest.fn(), status: 'ready', mode: 'generic', numbersHidden: false });
});

describe('step 1: the safety check (plan 3.4, 8.1)', () => {
  it('needs an answer before it goes on', async () => {
    const tree = await render(<SafetyCheckScreen />);
    expect(enabled(tree, 'safety-continue')).toBe(false);
    await press(tree, 'safety-none');
    expect(enabled(tree, 'safety-continue')).toBe(true);
  });

  it('"none of these" and "I would rather not say" both go on to the body questions', async () => {
    for (const id of ['safety-none', 'safety-prefer-not']) {
      nav.navigate.mockClear();
      const tree = await render(<SafetyCheckScreen />);
      await press(tree, id);
      await press(tree, 'safety-continue');
      expect(nav.navigate).toHaveBeenCalledWith('AboutYou');
    }
  });

  it.each([
    ['pregnant or breastfeeding', 'safety-pregnant'],
    ['an eating-disorder history', 'safety-ed'],
    ['a diet from a doctor or dietitian', 'safety-clinician'],
  ])('%s skips every body question and goes straight to the review', async (_label, id) => {
    const tree = await render(<SafetyCheckScreen />);
    await press(tree, id);
    await press(tree, 'safety-continue');
    expect(nav.navigate).toHaveBeenCalledWith('HealthReview');
    expect(nav.navigate).not.toHaveBeenCalledWith('AboutYou');
  });

  it('keeps "none of these" apart from the conditions, and lets several conditions stand together', async () => {
    const tree = await render(<SafetyCheckScreen />);
    await press(tree, 'safety-none');
    await press(tree, 'safety-pregnant');
    expect([current.draft.none, current.draft.pregnant]).toEqual([false, true]);
    await press(tree, 'safety-ed');
    expect([current.draft.pregnant, current.draft.eatingDisorder]).toEqual([true, true]);
    await press(tree, 'safety-none');
    expect([current.draft.none, current.draft.pregnant, current.draft.eatingDisorder]).toEqual([true, false, false]);
  });

  it('asks about a medicine separately, and it changes nothing about what is asked next', async () => {
    const tree = await render(<SafetyCheckScreen />);
    await press(tree, 'safety-none');
    await act(async () => { withId(tree, 'safety-medicine', 'onValueChange')!.props.onValueChange(true); });
    expect(current.draft.medicine).toBe(true);
    await press(tree, 'safety-continue');
    expect(nav.navigate).toHaveBeenCalledWith('AboutYou');
  });
});

describe('step 2: about you (plan 3.2, 8.1 G1, 7.7)', () => {
  it('needs every answer before it goes on', async () => {
    const tree = await render(<AboutYouScreen />);
    expect(enabled(tree, 'about-continue')).toBe(false);
    await type(tree, 'about-birth-year', '1990');
    await press(tree, 'about-sex-female');
    await type(tree, 'about-height-cm', '165');
    expect(enabled(tree, 'about-continue')).toBe(false);
    await type(tree, 'about-weight-kg', '62');
    expect(enabled(tree, 'about-continue')).toBe(true);
  });

  it('stops a birth year under 19 before any body data goes further, and never asks "is that right?"', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const tree = await render(<AboutYouScreen />, { ...ADULT, birthYear: String(new Date().getFullYear() - 15) });
    await press(tree, 'about-continue');
    expect(nav.navigate).toHaveBeenCalledWith('Under19');
    expect(nav.navigate).not.toHaveBeenCalledWith('Activity');
    expect(alert).not.toHaveBeenCalled();
  });

  it('goes on for an adult', async () => {
    const tree = await render(<AboutYouScreen />, ADULT);
    await press(tree, 'about-continue');
    expect(nav.navigate).toHaveBeenCalledWith('Activity');
  });

  it('asks "is that right?" about an unusual height or BMI, and goes on only if the person says so', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render(<AboutYouScreen />, { ...ADULT, height: { unit: 'cm', cm: '135', feet: '', inches: '' } });
    await press(tree, 'about-continue');
    expect(nav.navigate).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    buttons.find(b => b.text === 'It is right')!.onPress!();
    expect(nav.navigate).toHaveBeenCalledWith('Activity');
  });

  it('refuses a height or weight outside the hard limits, and says the limits', async () => {
    const tree = await render(<AboutYouScreen />, { ...ADULT, height: { unit: 'cm', cm: '100', feet: '', inches: '' } });
    expect(enabled(tree, 'about-continue')).toBe(false);
    expect(texts(tree).some(t => /Between 120 and 230 cm/.test(t))).toBe(true);
    const light = await render(<AboutYouScreen />, { ...ADULT, weight: { unit: 'kg', kg: '10', lb: '', stones: '', stonePounds: '' } });
    expect(enabled(light, 'about-continue')).toBe(false);
  });

  it('converts feet, inches, pounds and stones to metric as they are typed', async () => {
    const tree = await render(<AboutYouScreen />, { ...ADULT, height: { unit: 'ftin', cm: '', feet: '', inches: '' }, weight: { unit: 'lb', kg: '', lb: '', stones: '', stonePounds: '' } });
    await type(tree, 'about-height-ft', '5');
    await type(tree, 'about-height-in', '3');
    await type(tree, 'about-weight-lb', '132');
    expect(profileInputOf(current.draft)).toMatchObject({ heightCm: 160, weightKg: 59.9 });
    const st = await render(<AboutYouScreen />, { ...ADULT, height: { unit: 'cm', cm: '170', feet: '', inches: '' }, weight: { unit: 'st', kg: '', lb: '', stones: '', stonePounds: '' } });
    await type(st, 'about-weight-st', '10');
    await type(st, 'about-weight-stlb', '7');
    expect(profileInputOf(current.draft)).toMatchObject({ heightCm: 170, weightKg: 66.7 });
  });

  it('reads a birth year only from digits, four at most', async () => {
    const tree = await render(<AboutYouScreen />);
    await type(tree, 'about-birth-year', '19a9-0x1');
    expect(current.draft.birthYear).toBe('1990');
  });
});

describe('the end screens', () => {
  it('under 19: explains that personal targets are for adults, drops the draft, and goes back to the app', async () => {
    const tree = await render(<Under19Screen />, { ...ADULT });
    expect(texts(tree).some(t => /for adults 19 and over/.test(t))).toBe(true);
    await press(tree, 'under19-done');
    // Back to where the flow was opened, with none of its steps left to walk back through.
    expect(nav.navigate).not.toHaveBeenCalledWith('Main');
    expect(stackAfter(['Main', 'Settings', 'HealthIntro', 'SafetyCheck', 'AboutYou', 'Under19'])).toEqual(['Main', 'Settings']);
    expect(current.draft).toEqual(EMPTY_DRAFT);
  });
});

describe('step 3: activity (plan 4.2)', () => {
  it('needs a card, and the steps helper only pre-selects one', async () => {
    const tree = await render(<ActivityScreen />);
    expect(enabled(tree, 'activity-continue')).toBe(false);
    await act(async () => { tree.root.findAll(n => typeof n.props.onValueChange === 'function')[0]!.props.onValueChange(true); });
    await type(tree, 'activity-steps', '11000');
    expect(current.draft.activity).toBe('active');
    await type(tree, 'activity-steps', '3000');
    expect(current.draft.activity).toBe('inactive');
    // A card chosen by hand still wins.
    await press(tree, 'activity-very_active');
    expect(current.draft.activity).toBe('very_active');
    await press(tree, 'activity-continue');
    expect(nav.navigate).toHaveBeenCalledWith('HealthGoal');
  });
});

const set = (over: Partial<TargetSetInfo> = {}): TargetSetInfo => ({
  id: null,
  effectiveFrom: '2026-10-12',
  engineVersion: '1.0.0',
  referenceSet: 'nasem',
  mode: 'personalised',
  inputs: { ageBand: '19-30', sexForCalc: 'female', heightCm: 160, weightKg: 60, bmi: 23.4, activity: 'low_active', goal: 'general_health', goalApplied: 'general_health', pace: 'standard', pattern: 'omnivore' },
  energy: { maintenance: 2150, target: 2150, low: 1910, high: 2390, method: 'nasem2023', floorApplied: false, delta: 0, crossCheck: { mifflinPal: 2060, disagree: false } },
  targets: [
    { nutrient: 'protein', kind: 'minimum', unit: 'g', value: 60, refType: 'estimate', window: 'week', evidence: 'A', basis: 'protein-per-kg', how: '1.0 g for each kg of your weight.', scored: true, verdicts: true, origin: 'recommended' },
    { nutrient: 'fiber', kind: 'minimum', unit: 'g', value: 30, refType: 'AI', window: 'week', evidence: 'R', basis: 'nasem-fibre-ai', how: '14 g for every 1,000 kcal of your target.', scored: true, verdicts: true, origin: 'recommended' },
    { nutrient: 'sodium', kind: 'limit', unit: 'mg', value: 2300, refType: 'limit', window: 'week', evidence: 'R', basis: 'nasem2019-cdrr', how: 'The level above which cutting back is expected to help.', scored: true, verdicts: true, origin: 'recommended' },
  ],
  warnings: [],
  availableGoals: ['general_health', 'maintain', 'gain', 'build_muscle'],
  ...over,
});

describe('step 4: the goal, and the pace (plan 4.3)', () => {
  it('offers only the goals the Worker offers, and says so for the others', async () => {
    api_.previewTargets!.mockResolvedValue(set());
    const tree = await render(<GoalStepScreen />, ADULT);
    await flush();
    expect(enabled(tree, 'goal-lose')).toBe(false); // disabled: not offered for this height and weight
    expect(texts(tree).filter(t => /Not offered for your height and weight/.test(t)).length).toBe(1);
    await press(tree, 'goal-maintain');
    expect(current.draft.goal).toBe('maintain');
    expect(enabled(tree, 'goal-continue')).toBe(true);
    await press(tree, 'goal-continue');
    expect(nav.navigate).toHaveBeenCalledWith('Pattern');
  });

  it('for a loss, previews each pace with its daily calories and a first-weeks rate that slows down', async () => {
    const lose = (target: number, delta: number) => set({ availableGoals: ['general_health', 'maintain', 'lose', 'build_muscle'], energy: { maintenance: 1960, target, low: 1720, high: 2210, method: 'nasem2023', floorApplied: false, delta, crossCheck: { mifflinPal: 1800, disagree: false } } });
    api_.previewTargets!.mockImplementation(async (input: { pace?: string; goal?: string }) => (input.pace === 'gentle' ? lose(1760, -200) : input.pace === 'faster' ? lose(1560, -400) : lose(1670, -290)));
    const tree = await render(<GoalStepScreen />, { ...ADULT, goal: 'lose' });
    await flush();
    const all = texts(tree).join('\n');
    expect(all).toMatch(/About 1,760 kcal a day\. About 0\.2 kg a week at first, slowing down/);
    expect(all).toMatch(/About 1,670 kcal a day\. About 0\.3 kg a week/);
    expect(all).toMatch(/About 1,560 kcal a day\. About 0\.4 kg a week/);
    expect(all).toMatch(/A rough guide\. Real results vary a lot from person to person\./);
    // The live line follows the chosen pace: "About 1,670 kcal a day (a typical range is 1,430 to 1,920)".
    expect(texts(tree).some(t => /About 1,670 kcal a day \(a typical range is 1,430 to 1,920\)/.test(t))).toBe(true);
    await press(tree, 'pace-gentle');
    expect(texts(tree).some(t => /About 1,760 kcal a day \(a typical range is 1,520 to 2,010\)/.test(t))).toBe(true);
    expect(current.draft.pace).toBe('gentle');
  });
});

describe('step 0: the notice and consent, and the secret (plan 3.5, 8.3.2)', () => {
  it('goes on only after the person says they have read what is stored', async () => {
    const tree = await render(<HealthIntroScreen />);
    expect(enabled(tree, 'intro-continue')).toBe(false);
    await press(tree, 'intro-consent');
    expect(current.draft.consent).toBe(true);
    expect(enabled(tree, 'intro-continue')).toBe(true);
  });

  it('goes straight to the safety check when this phone has the secret', async () => {
    // The intro starts the flow afresh, so consent is given on the screen, not carried in.
    const tree = await render(<HealthIntroScreen />);
    await press(tree, 'intro-consent');
    await press(tree, 'intro-continue');
    await flush();
    expect(nav.navigate).toHaveBeenCalledWith('SafetyCheck');
    expect(api_.claimSecret).not.toHaveBeenCalled();
  });

  it('a profile made before secrets existed claims one, keeps it, and shows it once as a recovery code', async () => {
    const adoptSecret = jest.fn();
    (useProfile as jest.Mock).mockReturnValue({ secret: null, adoptSecret });
    api_.claimSecret!.mockResolvedValue({ secret: 'c'.repeat(43) });
    const tree = await render(<HealthIntroScreen />);
    await press(tree, 'intro-consent');
    await press(tree, 'intro-continue');
    await flush();
    expect(adoptSecret).toHaveBeenCalledWith('c'.repeat(43), { show: true });
    expect(nav.navigate).toHaveBeenCalledWith('RecoveryCode');
    expect(nav.navigate).not.toHaveBeenCalledWith('SafetyCheck');
  });

  it('a profile that already has a secret (a new phone) asks for the recovery code instead', async () => {
    (useProfile as jest.Mock).mockReturnValue({ secret: null, adoptSecret: jest.fn() });
    api_.claimSecret!.mockRejectedValue(new ApiError(409, 'secret_already_set', 'already'));
    const tree = await render(<HealthIntroScreen />);
    await press(tree, 'intro-consent');
    await press(tree, 'intro-continue');
    await flush();
    expect(nav.navigate).toHaveBeenCalledWith('RecoveryEntry');
  });

  it('starts an edit from the answers already given', async () => {
    (useHealth as jest.Mock).mockReturnValue({ profile: { mode: 'personalised', birthYear: 1990, sexForCalc: 'male', heightCm: 175, weightKg: 82, activity: 'active', goal: 'lose', pace: 'gentle', pattern: 'vegan' }, apply: jest.fn(), refresh: jest.fn(), status: 'ready', mode: 'personalised', numbersHidden: false });
    await render(<HealthIntroScreen />);
    expect(current.draft).toMatchObject({ consent: true, birthYear: '1990', sex: 'male', goal: 'lose', pace: 'gentle', pattern: 'vegan' });
    // The safety answers are never stored, so they are asked again.
    expect([current.draft.none, current.draft.pregnant]).toEqual([false, false]);
  });
});

describe('step 5: how you eat, and which tables to read (plan 3.2, 4.10)', () => {
  it('offers both reference sets with what is different about each, and chooses the one pressed', async () => {
    const tree = await render(<PatternScreen />);
    expect(enabled(tree, 'reference-nasem')).toBe(true);
    expect(enabled(tree, 'reference-icmr_nin')).toBe(true);
    const all = texts(tree).join('\n');
    expect(all).toContain('US and Canada (National Academies)');
    expect(all).toContain('India (ICMR-NIN)');
    expect(all).toContain('The tables used in India (ICMR-NIN, 2020). A lower sodium limit, and iron, zinc and vitamin B12 read against the average requirement.');
    expect(all).not.toContain('Coming later');
    expect(current.draft.referenceSet).toBe('nasem');
    await press(tree, 'reference-icmr_nin');
    expect(current.draft.referenceSet).toBe('icmr_nin');
    await press(tree, 'reference-nasem');
    expect(current.draft.referenceSet).toBe('nasem');
    await press(tree, 'pattern-continue');
    expect(nav.navigate).toHaveBeenCalledWith('HealthReview');
  });

  it('keeps a set the Worker says is not ready as a card that cannot be chosen, with the reason', async () => {
    api_.meta!.mockResolvedValue({
      ...FALLBACK_META,
      referenceSets: [
        { id: 'nasem', label: 'US and Canada (National Academies)', available: true },
        { id: 'icmr_nin', label: 'India (ICMR-NIN)', available: false },
      ],
    });
    const tree = await render(
      <MetaProvider>
        <PatternScreen />
      </MetaProvider>,
    );
    await flush();
    expect(enabled(tree, 'reference-icmr_nin')).toBe(false);
    expect(texts(tree).join('\n')).toContain('Coming later');
    expect(enabled(tree, 'reference-nasem')).toBe(true);
  });

  it('starts an edit on the set the person already uses', async () => {
    const tree = await render(<PatternScreen />, { referenceSet: 'icmr_nin' });
    expect(current.draft.referenceSet).toBe('icmr_nin');
    expect(pressable(tree, 'reference-icmr_nin')!.props.accessibilityState).toMatchObject({ checked: true });
    expect(pressable(tree, 'reference-nasem')!.props.accessibilityState).toMatchObject({ checked: false });
  });
});

describe('step 6: the review, and Save (plan 3.5, 8.1)', () => {
  it('for a safety answer that rules out personal targets: nothing to preview, and Save stores only the mode, the flags and the consent', async () => {
    const apply = jest.fn();
    (useHealth as jest.Mock).mockReturnValue({ profile: null, apply, refresh: jest.fn(), status: 'ready', mode: 'generic', numbersHidden: false });
    const response = { profile: { mode: 'reference_only', numbersHidden: false, dietInteractingMedicine: false }, targetSet: null, warnings: [{ id: 'reference_only', severity: 'info' }] };
    api_.saveHealthProfile!.mockResolvedValue(response);
    const tree = await render(<ReviewScreen />, { consent: true, pregnant: true });
    await flush();
    expect(api_.previewTargets).not.toHaveBeenCalled();
    expect(texts(tree).some(t => /not setting personal targets for you/.test(t))).toBe(true);
    await press(tree, 'review-save');
    await flush();
    expect(api_.saveHealthProfile).toHaveBeenCalledTimes(1);
    const body = api_.saveHealthProfile!.mock.calls[0]![0];
    expect(body.safety).toEqual({ pregnantOrBreastfeeding: true, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: false });
    expect(body.consentVersion).toBe(CONSENT_VERSION);
    // No body field is sent: there is none to send.
    expect(Object.keys(body.profile).sort()).toEqual(['goal', 'pace', 'pattern', 'referenceSet']);
    expect(apply).toHaveBeenCalledWith(response);
    expect(stackAfter(['Main', 'Settings', 'HealthIntro', 'SafetyCheck', 'HealthReview'])).toEqual(['Main', 'Settings', 'ReferenceOnly']);
  });

  it('an eating-disorder answer shows the hide-numbers switch already on', async () => {
    const tree = await render(<ReviewScreen />, { consent: true, eatingDisorder: true });
    await flush();
    expect(valueOf(tree, 'review-hide-numbers')).toBe(true);
    const other = await render(<ReviewScreen />, { consent: true, pregnant: true });
    expect(valueOf(other, 'review-hide-numbers')).toBe(false);
  });

  it('previews the energy as a range with the reason for each number, and saves to the targets screen', async () => {
    const apply = jest.fn();
    (useHealth as jest.Mock).mockReturnValue({ profile: null, apply, refresh: jest.fn(), status: 'ready', mode: 'generic', numbersHidden: false });
    api_.previewTargets!.mockResolvedValue(set());
    const saved = { profile: { mode: 'personalised' }, targetSet: set({ id: 'ts_1' }), warnings: [] };
    api_.saveHealthProfile!.mockResolvedValue(saved);
    const tree = await render(<ReviewScreen />, { ...ADULT, consent: true, none: true, activity: 'low_active' });
    await flush();
    const all = texts(tree).join('\n');
    expect(all).toMatch(/About 2,150 kcal a day \(a typical range is 1,910 to 2,390\)/);
    expect(all).toMatch(/Your real needs could be anywhere in this range/);
    expect(all).toMatch(/1\.0 g for each kg of your weight\./);
    expect(all).toMatch(/14 g for every 1,000 kcal of your target\./);
    expect(all).toMatch(/2,300 mg/);
    await press(tree, 'review-save');
    await flush();
    const body = api_.saveHealthProfile!.mock.calls[0]![0];
    expect(body.profile).toMatchObject({ sexForCalc: 'female', heightCm: 165, weightKg: 62, activity: 'low_active', goal: 'general_health' });
    expect(apply).toHaveBeenCalledWith(saved);
    // Saving shows the targets, and Back from them goes to where the flow was opened: the steps are off the stack.
    expect(nav.navigate).not.toHaveBeenCalled();
    expect(stackAfter(['Main', 'Settings', ...FLOW])).toEqual(['Main', 'Settings', 'Targets']);
    // Opened from the targets screen: back to that one, not a second copy on top.
    expect(stackAfter(['Main', 'Targets', ...FLOW])).toEqual(['Main', 'Targets']);
    expect(stackAfter(['Main', ...FLOW])).toEqual(['Main', 'Targets']);
  });

  it('opens the explanation in the words of the set chosen: the India set says 2,000 mg and the average requirement', async () => {
    api_.previewTargets!.mockResolvedValue(set({ referenceSet: 'icmr_nin' }));
    const tree = await render(<ReviewScreen />, { ...ADULT, consent: true, none: true, activity: 'low_active', referenceSet: 'icmr_nin' });
    await flush();
    await press(tree, 'review-how');
    const all = texts(tree).join('\n');
    expect(all).toContain('Sodium is a limit of 2,000 mg a day, about 5 g of salt.');
    expect(all).toContain('Estimated Average Requirement');
    expect(all).not.toContain('Iron is 1.8 times higher');
    const us = await render(<ReviewScreen />, { ...ADULT, consent: true, none: true, activity: 'low_active', referenceSet: 'nasem' });
    await flush();
    await press(us, 'review-how');
    expect(texts(us).join('\n')).toContain('Iron is 1.8 times higher if you eat no meat');
  });

  it('explains a loss goal that was held at Maintain, and a BMI notice', async () => {
    api_.previewTargets!.mockResolvedValue(set({ inputs: { ...set().inputs!, goal: 'lose', goalApplied: 'maintain' }, warnings: [{ id: 'lose_not_indicated_bmi', severity: 'caution' }, { id: 'underweight_notice', severity: 'caution' }, { id: 'estimates_disagree', severity: 'info' }] }));
    const tree = await render(<ReviewScreen />, { ...ADULT, consent: true, none: true, activity: 'low_active', goal: 'lose' });
    await flush();
    const all = texts(tree).join('\n');
    expect(all).toMatch(/which is not offered for your height and weight, so your target keeps your weight steady/);
    expect(all).toMatch(/Your BMI is under 18\.5\. A doctor or dietitian can help/);
    expect(all).toMatch(/The estimates disagree more than usual for your body size/);
  });

  it('shows the error when saving fails, and does not move on', async () => {
    api_.previewTargets!.mockResolvedValue(set());
    api_.saveHealthProfile!.mockRejectedValue(new Error('Could not reach the server'));
    const tree = await render(<ReviewScreen />, { ...ADULT, consent: true, none: true, activity: 'low_active' });
    await flush();
    await press(tree, 'review-save');
    await flush();
    expect(texts(tree).some(t => /Could not reach the server/.test(t))).toBe(true);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('needs the consent before it saves', async () => {
    api_.previewTargets!.mockResolvedValue(set());
    const tree = await render(<ReviewScreen />, { ...ADULT, none: true, activity: 'low_active' });
    await flush();
    expect(enabled(tree, 'review-save')).toBe(false);
  });
});
