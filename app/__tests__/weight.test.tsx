/**
 * Weight over time (WEEKLY_BREAKDOWN_PLAN.md 4.9, 5.6, 5.7, 6.2, 6.6, Phase 5): the weight line and the plan check, the weigh-in sheet, what
 * changed when a weigh-in made new targets, the prompt that is at most a question every four weeks, and the experimental calibration.
 */
import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true), addListener: jest.fn(() => () => {}) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useWeeklyReport', () => ({ useWeeklyReport: jest.fn() }));
jest.mock('@/hooks/useToday', () => ({ useToday: jest.fn(() => '2026-10-11') }));
jest.mock('@/hooks/useHealthCard', () => ({ useHealthCard: jest.fn(() => ({ visible: false, dismiss: jest.fn() })) }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: jest.fn() }));
jest.mock('@/state/MetaContext', () => ({ useMeta: jest.fn() }));
jest.mock('@/api/client', () => {
  // Plain assignments, not parameter properties: a jest.mock factory may not reference Babel's helpers.
  class ApiError extends Error {
    status: number;
    code: string;
    details: Record<string, unknown>;
    constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }
  return { ApiError, errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)), api: { addWeight: jest.fn() } };
});

import { api, ApiError } from '@/api/client';
import type { Meta, TargetSetInfo, WeeklyReport } from '@/api/types';
import { CalibrationCard } from '@/components/weight/CalibrationCard';
import { WeighInSheet, targetChangeLines } from '@/components/weight/WeighInSheet';
import { WeightCard } from '@/components/weight/WeightCard';
import { useWeeklyReport } from '@/hooks/useWeeklyReport';
import { useWeightPrompt, WEIGH_IN_PROMPT_DAYS } from '@/hooks/useWeightPrompt';
import { useToday } from '@/hooks/useToday';
import { signedNumber } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import ReportScreen from '@/screens/ReportScreen';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { useProfile } from '@/state/ProfileContext';
import { ThemeProvider } from '@/theme';
import { insightText } from '@/utils/insights';
import metaJson from './fixtures/meta.json';
import reportsJson from './fixtures/reports.json';

const R = reportsJson as unknown as Record<string, WeeklyReport>;
const META = metaJson as unknown as Meta;
const api_ = api as unknown as Record<string, jest.Mock>;

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const texts = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf);
const all = (tree: TestRenderer.ReactTestRenderer) => texts(tree).join('\n');
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id);
const has = (tree: TestRenderer.ReactTestRenderer, id: string) => byId(tree, id).length > 0;
const trees: TestRenderer.ReactTestRenderer[] = [];
async function render(ui: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<ThemeProvider>{ui}</ThemeProvider>);
  });
  trees.push(tree);
  return tree;
}
afterEach(async () => {
  await act(async () => {
    for (const t of trees.splice(0)) t.unmount();
  });
});
const press = async (tree: TestRenderer.ReactTestRenderer, id: string) => {
  const node = tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
  if (!node) throw new Error(`nothing pressable with testID ${id}`);
  await act(async () => {
    await node.props.onPress();
  });
};
const type = async (tree: TestRenderer.ReactTestRenderer, id: string, text: string) => {
  const input = byId(tree, id).find(n => typeof n.props.onChangeText === 'function');
  if (!input) throw new Error(`no input with testID ${id}`);
  await act(async () => {
    input.props.onChangeText(text);
  });
};
const showing = (report: WeeklyReport | null) =>
  (useWeeklyReport as jest.Mock).mockReturnValue({ report, locked: false, loading: false, refreshing: false, error: null, reload: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  (useMeta as jest.Mock).mockReturnValue(META);
  (useToday as jest.Mock).mockReturnValue('2026-10-11');
  (useProfile as jest.Mock).mockReturnValue({ profile: { id: 'u1', name: 'Zoe' } });
  (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready', targetSet: null, profile: { weightDate: '2026-10-10' }, refresh: jest.fn(() => Promise.resolve()) });
  showing(R.ordinary!);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('the weight line (plan 5.7)', () => {
  const card = (weight: WeeklyReport['weight'], isCurrent = true, onAdd = jest.fn()) => render(<WeightCard weight={weight} isCurrent={isCurrent} onAdd={onAdd} />);

  it('shows the latest weigh-in, the trend, and the trend as a line with a text summary', async () => {
    const w = R.weight_losing!.weight!;
    const tree = await card(w);
    expect(byId(tree, 'weight-latest')[0]!.props.children).toBe('85 kg');
    expect(byId(tree, 'weight-trend')[0]!.props.children).toBe('Trend 85.5 kg');
    expect(all(tree)).toContain('36 weigh-ins');
    const summary = tree.root.findAll((n: ReactTestInstance) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Weight trend, from 2026-'));
    expect(summary.length).toBeGreaterThan(0);
    expect(summary[0]!.props.accessibilityLabel).toMatch(/Last weeks: \d+\.\d+ kg, /);
  });

  it('says a rate in words once there is one, says so when the trend is steady, and promises one before that', async () => {
    expect(all(await card(R.weight_losing!.weight!))).toContain('The trend is falling by about 0.3 kg a week.');
    expect(byId(await card(R.ordinary!.weight!), 'weight-rate')[0]!.props.children).toBe('The trend is steady.');
    const early = { ...R.ordinary!.weight!, ratePerWeekKg: null };
    expect(byId(await card(early), 'weight-rate')[0]!.props.children).toBe('A weekly rate appears after three weeks of weigh-ins.');
    const up = { ...R.ordinary!.weight!, ratePerWeekKg: 0.2 };
    expect(byId(await card(up), 'weight-rate')[0]!.props.children).toBe('The trend is rising by about 0.2 kg a week.');
  });

  it('sets the trend against the plan as information, with its range and the standard caution, for a plan that asks for a change', async () => {
    const t = byId(await card(R.weight_losing!.weight!), 'weight-plan')[0]!.props.children.join('');
    expect(t).toBe('Over 4 weeks your trend weight changed −1.2 kg. Your plan expects a change of about −0.8 to −1 kg. A rough guide. Real results vary a lot from person to person.');
    expect(has(await card(R.ordinary!.weight!), 'weight-plan')).toBe(false);
  });

  it('says what the scale\'s ordinary swing is, so a small change is not read as one', async () => {
    expect(all(await card(R.ordinary!.weight!))).toContain('Weight moves up and down by about 0.2 kg from day to day, so the trend is the better guide.');
  });

  it('offers a weigh-in on this week, and not on a week gone by', async () => {
    const onAdd = jest.fn();
    await press(await card(R.ordinary!.weight!, true, onAdd), 'weight-add');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(has(await card(R.ordinary!.weight!, false), 'weight-add')).toBe(false);
  });

  it('with no weigh-in yet, invites one for this week and says nothing for a past one', async () => {
    const empty = await card(null, true);
    expect(all(empty)).toContain('No weigh-ins yet. Add one to see your trend.');
    expect(has(empty, 'weight-add')).toBe(true);
    expect(has(await card(null, false), 'weight-card')).toBe(false);
  });

  it('shows no verdict word and no colour for up or down', async () => {
    const t = all(await card(R.weight_losing!.weight!));
    expect(t).not.toMatch(/\b(good|bad|great|well done|off track|behind|ahead|failed|goal weight)\b/i);
  });
});

describe('the weight insights (plan 5.6)', () => {
  const env = { nutrients: META.nutrients, numbersHidden: false };
  it('says the trend against the plan with signs, in the plan\'s own words', () => {
    const i = R.weight_losing!.insights.find(x => x.id === 'weight_vs_plan')!;
    expect(insightText(i, env)).toBe('Your trend weight changed −1.2 kg in 4 weeks; your plan expects about −0.9 kg.');
    expect(signedNumber(0.5)).toBe('+0.5');
    expect(signedNumber(-1.25)).toBe('−1.3');
    expect(signedNumber(0)).toBe('0');
  });

  it('puts the safety message about a rapid fall first, and points to a professional', () => {
    const r = R.rapid_loss!;
    expect(r.insights[0]).toEqual({ id: 'rapid_loss', priority: 1, params: {} });
    expect(insightText(r.insights[0]!, env)).toBe('Your weight has been dropping faster than the usual 0.5 to 1% a week. Slowing down is usually safer; a doctor or dietitian can advise.');
  });

  it('is worded without a number when numbers are hidden', () => {
    const text = insightText({ id: 'rapid_loss', priority: 1, params: {} }, { nutrients: META.nutrients, numbersHidden: true })!;
    expect(text).toBe('Your weight has been dropping quickly. Slowing down is usually safer; a doctor or dietitian can advise.');
    expect(/\d/.test(text)).toBe(false);
  });
});

describe('the weigh-in sheet (plan 6.2, 7.7)', () => {
  const sheet = (onSaved = jest.fn()) => render(<WeighInSheet visible onClose={jest.fn()} onSaved={onSaved} />);
  beforeEach(() => api_.addWeight.mockResolvedValue({ weight: { date: '2026-10-11', weightKg: 62.5 }, targetSet: null, changed: false }));

  it('cannot be saved until there is a weight in range, and says so for one that cannot be right', async () => {
    const tree = await sheet();
    expect(byId(tree, 'weigh-in-save').some(n => n.props.disabled === true)).toBe(true);
    await type(tree, 'weigh-in-kg', '5');
    expect(all(tree)).toContain('Please check the weight.');
    expect(byId(tree, 'weigh-in-save').some(n => n.props.disabled === true)).toBe(true);
    await type(tree, 'weigh-in-kg', '62.5');
    expect(all(tree)).not.toContain('Please check the weight.');
    expect(byId(tree, 'weigh-in-save').every(n => n.props.disabled !== true)).toBe(true);
  });

  it('sends metric, to a tenth of a kilogram, whatever it was typed in', async () => {
    const onSaved = jest.fn();
    const tree = await sheet(onSaved);
    await type(tree, 'weigh-in-kg', '62.54');
    await press(tree, 'weigh-in-save');
    expect(api_.addWeight).toHaveBeenLastCalledWith(62.5, {});
    expect(onSaved).toHaveBeenCalledWith({ weightKg: 62.5, changed: false, targetSet: null });

    const lb = await sheet();
    await act(async () => {
      lb.root.findAll((n: ReactTestInstance) => typeof n.props.onChange === 'function' && Array.isArray(n.props.options))[0]!.props.onChange('lb');
    });
    await type(lb, 'weigh-in-lb', '150');
    await press(lb, 'weigh-in-save');
    expect(api_.addWeight).toHaveBeenLastCalledWith(68, {});

    const st = await sheet();
    await act(async () => {
      st.root.findAll((n: ReactTestInstance) => typeof n.props.onChange === 'function' && Array.isArray(n.props.options))[0]!.props.onChange('st');
    });
    await type(st, 'weigh-in-st', '10');
    await type(st, 'weigh-in-stlb', '7');
    await press(st, 'weigh-in-save');
    expect(api_.addWeight).toHaveBeenLastCalledWith(66.7, {}); // 10 st 7 lb is 147 lb
  });

  it('asks "is that right?" for a change of more than 3 kg from the day before, and saves only if the person says so', async () => {
    api_.addWeight.mockRejectedValueOnce(new ApiError(409, 'weight_change_large', 'That is more than 3 kg different from the day before. Is that right?', { previousKg: 60 }));
    const onSaved = jest.fn();
    const tree = await sheet(onSaved);
    await type(tree, 'weigh-in-kg', '68');
    await press(tree, 'weigh-in-save');
    expect(onSaved).not.toHaveBeenCalled();
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toBe('Is that right?');
    expect(body).toBe('That is more than 3 kg different from the day before. Is that right?');
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(['Cancel', 'Yes, save it']);
    await act(async () => {
      await buttons[1].onPress();
    });
    expect(api_.addWeight).toHaveBeenLastCalledWith(68, { confirm: true });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('shows what the Worker refused, and keeps the sheet open', async () => {
    api_.addWeight.mockRejectedValue(new ApiError(400, 'bad_request', 'That weight does not look right for your height. Check it and try again.'));
    const onSaved = jest.fn();
    const tree = await sheet(onSaved);
    await type(tree, 'weigh-in-kg', '300');
    await press(tree, 'weigh-in-save');
    expect(all(tree)).toContain('That weight does not look right for your height. Check it and try again.');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('says plainly that a weigh-in only moves the targets when it moves the weight by 3% or 2 kg', async () => {
    expect(all(await sheet())).toContain('A weigh-in only moves your targets when it differs from the weight they used by 3% or 2 kg, whichever is more.');
  });
});

describe('what changed, and why (plan 6.2)', () => {
  const set = (energy: number, protein: number): TargetSetInfo =>
    ({ id: 's', effectiveFrom: '2026-10-11', energy: { target: energy }, targets: [{ nutrient: 'protein', value: protein }] }) as unknown as TargetSetInfo;
  it('says it in two lines, never silently', () => {
    expect(targetChangeLines(set(1900, 78), set(1850, 74))).toEqual(['Calories 1,900 to 1,850 because your weight changed', 'Protein 78 g to 74 g because your weight changed']);
  });
  it('mentions only what moved, and nothing without both sets', () => {
    expect(targetChangeLines(set(1900, 78), set(1850, 78))).toEqual(['Calories 1,900 to 1,850 because your weight changed']);
    expect(targetChangeLines(set(1900, 78), set(1900, 78))).toEqual([]);
    expect(targetChangeLines(null, set(1900, 78))).toEqual([]);
  });
});

describe('the weight line on the Report tab', () => {
  it('is there for a person with personal targets, and opens the sheet to add a weigh-in', async () => {
    showing({ ...R.ordinary!, week: { ...R.ordinary!.week, isCurrent: true } });
    const tree = await render(<ReportScreen />);
    expect(has(tree, 'weight-card')).toBe(true);
    await press(tree, 'weight-add');
    expect(has(tree, 'weigh-in-sheet')).toBe(true);
  });

  it('says what changed when a weigh-in made new targets, then refreshes the targets and the week', async () => {
    const refresh = jest.fn(() => Promise.resolve());
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready', targetSet: { energy: { target: 2150 }, targets: [{ nutrient: 'protein', value: 60 }] }, profile: { weightDate: '2026-10-10' }, refresh });
    const reload = jest.fn();
    (useWeeklyReport as jest.Mock).mockReturnValue({ report: { ...R.ordinary!, week: { ...R.ordinary!.week, isCurrent: true } }, locked: false, loading: false, refreshing: false, error: null, reload });
    api_.addWeight.mockResolvedValue({ weight: { date: '2026-10-11', weightKg: 55 }, targetSet: { energy: { target: 2050 }, targets: [{ nutrient: 'protein', value: 56 }] }, changed: true });
    const tree = await render(<ReportScreen />);
    await press(tree, 'weight-add');
    await type(tree, 'weigh-in-kg', '55');
    await press(tree, 'weigh-in-save');
    expect(texts(tree).join(' ')).toContain('Your targets were updated. Calories 2,150 to 2,050 because your weight changed Protein 60 g to 56 g because your weight changed');
    expect(refresh).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('just says it was saved when the targets did not move', async () => {
    showing({ ...R.ordinary!, week: { ...R.ordinary!.week, isCurrent: true } });
    api_.addWeight.mockResolvedValue({ weight: { date: '2026-10-11', weightKg: 60.4 }, targetSet: null, changed: false });
    const tree = await render(<ReportScreen />);
    await press(tree, 'weight-add');
    await type(tree, 'weigh-in-kg', '60.4');
    await press(tree, 'weigh-in-save');
    expect(all(tree)).toContain('Weigh-in saved.');
    expect(all(tree)).not.toContain('Your targets were updated.');
  });

  it('is not there in low-pressure mode, without personal targets, or with no personal targets at all', async () => {
    showing(R.low_pressure_personal!);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: true, status: 'ready', targetSet: null, profile: {}, refresh: jest.fn() });
    expect(has(await render(<ReportScreen />), 'weight-card')).toBe(false);
    showing(R.generic!);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'generic', numbersHidden: false, status: 'ready', targetSet: null, profile: null, refresh: jest.fn() });
    expect(has(await render(<ReportScreen />), 'weight-card')).toBe(false);
    showing(R.reference_only!);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'reference_only', numbersHidden: false, status: 'ready', targetSet: null, profile: {}, refresh: jest.fn() });
    expect(has(await render(<ReportScreen />), 'weight-card')).toBe(false);
  });

  it('puts the safety message about a rapid fall at the top of what stood out', async () => {
    showing(R.rapid_loss!);
    const tree = await render(<ReportScreen />);
    const ids = tree.root.findAll((n: ReactTestInstance) => typeof n.props.testID === 'string' && n.props.testID.startsWith('insight-') && typeof n.type !== 'string').map(n => n.props.testID);
    expect(ids[0]).toBe('insight-rapid_loss');
  });
});

describe('the experimental calibration (plan 4.9)', () => {
  it('says what it is: experimental, an estimate with its range, that logs run low, and that nothing changed', async () => {
    const tree = await render(<CalibrationCard calibration={R.calibration!.calibration!} />);
    const t = all(tree);
    expect(t).toContain('Experimental');
    expect(t).toContain('suggest you may use about 1,800 kcal a day, give or take 110. Your targets use 2,150.');
    expect(t).toContain('Logs usually run low, so the real figure is probably higher.');
    expect(t).toContain('This is a rough, unproven estimate, so nothing was changed.');
  });

  it('appears on the Report tab only when the Worker sends it', async () => {
    showing(R.calibration!);
    expect(has(await render(<ReportScreen />), 'calibration-card')).toBe(true);
    showing(R.ordinary!);
    expect(has(await render(<ReportScreen />), 'calibration-card')).toBe(false);
  });

  it('tells nobody to eat more or less', () => {
    const words = Object.values(strings.report.calibration).join(' ');
    expect(words).not.toMatch(/\b(you should|eat (more|less)|increase|reduce|cut)\b/i);
  });
});

describe('"Update your weight?" (plan 6.6)', () => {
  const Probe = () => {
    const p = useWeightPrompt();
    return <>{p.visible ? <PromptShown dismiss={p.dismiss} /> : null}</>;
  };
  const shown: { dismiss: () => void }[] = [];
  const PromptShown = ({ dismiss }: { dismiss: () => void }) => {
    shown.push({ dismiss });
    return null;
  };
  const health = (over: Record<string, unknown> = {}) =>
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready', targetSet: null, profile: { weightDate: '2026-09-01' }, refresh: jest.fn(), ...over });
  const visible = async () => {
    shown.length = 0;
    const tree = await render(<Probe />);
    await act(async () => {
      await Promise.resolve();
    });
    return { tree, on: shown.length > 0 };
  };
  beforeEach(async () => {
    await AsyncStorage.clear();
    health();
  });

  it('asks once the last weigh-in is four weeks old, and not before', async () => {
    expect(WEIGH_IN_PROMPT_DAYS).toBe(28);
    expect((await visible()).on).toBe(true);
    health({ profile: { weightDate: '2026-09-14' } }); // 27 days before 2026-10-11
    expect((await visible()).on).toBe(false);
    health({ profile: { weightDate: '2026-09-13' } }); // 28 days
    expect((await visible()).on).toBe(true);
  });

  it('never asks in low-pressure mode, without personal targets, or without a weigh-in on file', async () => {
    health({ numbersHidden: true });
    expect((await visible()).on).toBe(false);
    health({ mode: 'generic' });
    expect((await visible()).on).toBe(false);
    health({ mode: 'reference_only' });
    expect((await visible()).on).toBe(false);
    health({ profile: {} });
    expect((await visible()).on).toBe(false);
    health({ status: 'locked' });
    expect((await visible()).on).toBe(false);
  });

  it('stays quiet for four weeks after "Not now", then asks again', async () => {
    const first = await visible();
    expect(first.on).toBe(true);
    await act(async () => {
      shown[0]!.dismiss();
    });
    expect((await visible()).on).toBe(false);
    (useToday as jest.Mock).mockReturnValue('2026-11-07'); // 27 days later
    expect((await visible()).on).toBe(false);
    (useToday as jest.Mock).mockReturnValue('2026-11-08'); // 28 days later
    expect((await visible()).on).toBe(true);
  });

  it('is a question on the Report tab with two plain choices, nothing else about weight, and no prompt for a fresh weigh-in', async () => {
    showing({ ...R.ordinary!, week: { ...R.ordinary!.week, isCurrent: true } });
    health({ profile: { weightDate: '2026-10-10' } });
    const fresh = await render(<ReportScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(has(fresh, 'weight-prompt')).toBe(false);

    health({ profile: { weightDate: '2026-09-01' } });
    const stale = await render(<ReportScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(has(stale, 'weight-prompt')).toBe(true);
    expect(all(stale)).toContain('Update your weight?');
    await press(stale, 'weight-prompt-dismiss');
    expect(has(stale, 'weight-prompt')).toBe(false);
    const again = await render(<ReportScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(has(again, 'weight-prompt')).toBe(false); // remembered on this phone
    const words = Object.values(strings.report.weighPrompt).join(' ');
    expect(words).not.toMatch(/\b(streak|behind|missed|overdue|remind|don't forget|goal)\b/i);
  });

  it('opens the weigh-in sheet from "Update"', async () => {
    showing({ ...R.ordinary!, week: { ...R.ordinary!.week, isCurrent: true } });
    health({ profile: { weightDate: '2026-09-01' } });
    const tree = await render(<ReportScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    await press(tree, 'weight-prompt-update');
    expect(all(tree)).toContain('Add a weigh-in');
  });
});
