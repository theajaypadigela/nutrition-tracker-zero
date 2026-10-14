/**
 * Marking a day (WEEKLY_BREAKDOWN_PLAN.md 7.2, 9.4): the sheet, the entry point on Today, and the insight that opens the day.
 */
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true), addListener: jest.fn(() => () => {}) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useToday', () => ({ useToday: () => '2026-10-11' }));
jest.mock('@/hooks/useHealthCard', () => ({ useHealthCard: () => ({ visible: false, dismiss: jest.fn() }) }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/state/MetaContext', () => ({ useMeta: jest.fn() }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u', name: 'Zoe' } }) }));
jest.mock('@/services/calls/schedule', () => ({ applySchedule: jest.fn(() => Promise.resolve()) }));
jest.mock('@/api/client', () => {
  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
  return {
    errorMessage,
    api: { getSettings: jest.fn(), getDay: jest.fn(), setDayStatus: jest.fn(), clearDayStatus: jest.fn(), updateSettings: jest.fn(), deleteItem: jest.fn() },
  };
});

import { api } from '@/api/client';
import type { Day, DayMark, Insight, Item, Meta } from '@/api/types';
import { DayStatusSheet } from '@/components/today/DayStatusSheet';
import { weightText } from '@/components/today/MealSection';
import { strings } from '@/i18n/strings';
import TodayScreen from '@/screens/TodayScreen';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { ThemeProvider } from '@/theme';
import { insightAction } from '@/utils/insights';
import metaJson from './fixtures/meta.json';

const META = { units: [], meals: ['breakfast', 'lunch', 'snack', 'dinner'], baseUnits: [], ...(metaJson as object) } as unknown as Meta;
const rn = jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock>; useRoute: jest.Mock };
const nav = rn.__nav;
const api_ = api as unknown as Record<string, jest.Mock>;

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id);
const press = async (tree: TestRenderer.ReactTestRenderer, id: string) => {
  const node = tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
  if (!node) throw new Error(`nothing pressable with testID ${id}`);
  await act(async () => {
    await node.props.onPress();
  });
};

const trees: TestRenderer.ReactTestRenderer[] = [];
async function render(ui: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<ThemeProvider>{ui}</ThemeProvider>);
  });
  trees.push(tree);
  return tree;
}
// A sheet that is still animating when a test ends would run its callback after the environment is torn down.
afterEach(async () => {
  await act(async () => {
    for (const t of trees.splice(0)) t.unmount();
  });
});

const day = (date: string, status: DayMark | null = null): Day => ({
  date,
  status,
  items: [],
  totals: {},
  goals: { calories: 2150 },
  customGoals: [],
  pendingCount: 0,
  calls: [],
});

describe('the day status sheet', () => {
  const sheet = (current: DayMark | null, onChange = jest.fn()) => render(<DayStatusSheet visible onClose={jest.fn()} current={current} onChange={onChange} />);

  it('offers the three marks, each with what it does, and says nothing is deleted', async () => {
    const t = all(await sheet(null));
    for (const s of [strings.day.sheet.complete, strings.day.sheet.partial, strings.day.sheet.skip]) expect(t).toContain(s);
    expect(t).toContain('It is complete');
    expect(t).toContain('Count this day, even if it has little or nothing logged.');
    expect(t).toContain('Leave it out of the weekly figures until you add what is missing.');
    expect(t).toContain('Illness, travel, a festival, or a day you do not want counted.');
    expect(t).toContain('Nothing is deleted.');
  });

  it('reports the choice, and a mark can be changed', async () => {
    const onChange = jest.fn();
    const tree = await sheet('complete', onChange);
    await press(tree, 'day-mark-skip');
    expect(onChange).toHaveBeenCalledWith('skip');
    await press(tree, 'day-mark-partial');
    expect(onChange).toHaveBeenLastCalledWith('partial');
  });

  it('shows which mark is current, in words for the screen reader, and offers to clear it only when there is one', async () => {
    const marked = await sheet('partial');
    expect(marked.root.findAll((n: ReactTestInstance) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.endsWith('Current mark')).length).toBeGreaterThan(0);
    expect(byId(marked, 'day-mark-clear').length).toBeGreaterThan(0);
    const none = await sheet(null);
    expect(byId(none, 'day-mark-clear')).toHaveLength(0);
  });

  it('clears the mark', async () => {
    const onChange = jest.fn();
    await press(await sheet('skip', onChange), 'day-mark-clear');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('says nothing that moralises, and no digit', async () => {
    const t: string[] = [...Object.values(strings.day.sheet), ...Object.values(strings.day.marked)];
    expect(t.filter(s => /\d/.test(s))).toEqual([]);
  });
});

describe('the Today screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useMeta as jest.Mock).mockReturnValue(META);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready' });
    rn.useRoute.mockReturnValue({ params: {} });
    api_.getSettings.mockResolvedValue({ id: 'u', name: 'Zoe', timezone: 'Asia/Kolkata', callTime: null, callEnabled: false, vapi: { configured: false }, lastCall: null });
    api_.getDay.mockImplementation((date: string) => Promise.resolve(day(date)));
    api_.setDayStatus.mockResolvedValue({});
    api_.clearDayStatus.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('replaces the generic protein target with the saved personal target when health settings change', async () => {
    (useHealth as jest.Mock).mockReturnValue({ mode: 'generic', numbersHidden: false, status: 'ready', revision: 1 });
    api_.getDay.mockResolvedValue({ ...day('2026-10-11'), goals: { calories: 2000, protein: 50 } });
    const tree = await render(<TodayScreen />);
    expect(all(tree)).toContain('of 50 g');
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready', revision: 2 });
    api_.getDay.mockResolvedValue({ ...day('2026-10-11'), goals: { calories: 2400, protein: 89 } });
    await act(async () => { tree.update(<ThemeProvider><TodayScreen /></ThemeProvider>); });
    expect(all(tree)).toContain('of 89 g');
    expect(all(tree)).not.toContain('of 50 g');
  });

  it('has an entry point to mark the day, whatever the mode', async () => {
    const tree = await render(<TodayScreen />);
    expect(all(tree)).toContain('Mark this day');
    (useHealth as jest.Mock).mockReturnValue({ mode: 'reference_only', numbersHidden: true, status: 'ready' });
    expect(all(await render(<TodayScreen />))).toContain('Mark this day'); // low-pressure mode too
  });

  it('says what the day is marked as', async () => {
    api_.getDay.mockResolvedValue(day('2026-10-11', 'skip'));
    expect(all(await render(<TodayScreen />))).toContain('Left out');
    api_.getDay.mockResolvedValue(day('2026-10-11', 'partial'));
    expect(all(await render(<TodayScreen />))).toContain('Marked incomplete');
    api_.getDay.mockResolvedValue(day('2026-10-11', 'complete'));
    expect(all(await render(<TodayScreen />))).toContain('Marked complete');
  });

  it('marks the day shown, and reloads it', async () => {
    const tree = await render(<TodayScreen />);
    await press(tree, 'mark-day');
    await press(tree, 'day-mark-complete');
    expect(api_.setDayStatus).toHaveBeenCalledWith('2026-10-11', 'complete');
    expect(api_.getDay.mock.calls.length).toBeGreaterThan(1);
  });

  it('clears a mark', async () => {
    api_.getDay.mockResolvedValue(day('2026-10-11', 'skip'));
    const tree = await render(<TodayScreen />);
    await press(tree, 'mark-day');
    await press(tree, 'day-mark-clear');
    expect(api_.clearDayStatus).toHaveBeenCalledWith('2026-10-11');
    expect(api_.setDayStatus).not.toHaveBeenCalled();
  });

  it('says so when a mark could not be saved, and does not pretend', async () => {
    api_.setDayStatus.mockRejectedValue(new Error('offline'));
    const tree = await render(<TodayScreen />);
    await press(tree, 'mark-day');
    await press(tree, 'day-mark-skip');
    expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'offline');
  });

  it('opens on the day an insight asked for, never a day to come', async () => {
    rn.useRoute.mockReturnValue({ params: { date: '2026-10-08' } });
    await render(<TodayScreen />);
    expect(api_.getDay).toHaveBeenCalledWith('2026-10-08');
    api_.getDay.mockClear();
    rn.useRoute.mockReturnValue({ params: { date: '2026-12-25' } });
    await render(<TodayScreen />);
    expect(api_.getDay).not.toHaveBeenCalledWith('2026-12-25');
  });
});

const item = (over: Partial<Item> = {}): Item => ({
  id: 'i1',
  localDate: '2026-10-08',
  meal: 'lunch',
  rawName: 'rice',
  normalizedName: 'rice',
  quantity: 2,
  unit: 'katori',
  foodId: 'rice',
  foodName: 'Rice',
  baseUnit: '100 g',
  status: 'resolved',
  source: 'call',
  callId: null,
  createdAt: 't',
  nutrients: { calories: 390, protein: 8, carbs: 84, fat: 1 },
  weight: { value: 300, unit: 'g' },
  amountCheck: null,
  ...over,
});

describe('a day that looks incomplete, on the day itself (plan 7.2, 7.8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useMeta as jest.Mock).mockReturnValue(META);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready' });
    rn.useRoute.mockReturnValue({ params: { date: '2026-10-08' } });
    api_.getSettings.mockResolvedValue({ id: 'u', name: 'Zoe', timezone: 'Asia/Kolkata', callTime: null, callEnabled: false, vapi: { configured: false }, lastCall: null });
    api_.setDayStatus.mockResolvedValue({});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  const low = (over: Partial<Day> = {}): Day => ({
    ...day('2026-10-08'),
    items: [item()],
    totals: { calories: { value: 694, missingItems: 0 } },
    dayState: { state: 'partial', reason: 'low' },
    ...over,
  });

  it('asks whether a past day with very little logged is everything, with both answers one tap away', async () => {
    api_.getDay.mockResolvedValue(low());
    const tree = await render(<TodayScreen />);
    expect(all(tree)).toContain('This day looks incomplete');
    expect(all(tree)).toContain('About 690 kcal is logged, so it is left out of your weekly figures. Is that everything you ate?');
    await press(tree, 'incomplete-complete');
    expect(api_.setDayStatus).toHaveBeenCalledWith('2026-10-08', 'complete');
    await press(tree, 'incomplete-skip');
    expect(api_.setDayStatus).toHaveBeenLastCalledWith('2026-10-08', 'skip');
  });

  it('does not ask about today, a day that counts, one with unknown foods, or one the person marked', async () => {
    for (const d of [
      low({ dayState: { state: 'valid', reason: null } }),
      low({ dayState: { state: 'partial', reason: 'pending' } }),
      low({ dayState: { state: 'partial', reason: 'marked' }, status: 'partial' }),
      low({ dayState: { state: 'confirmed', reason: null }, status: 'complete' }),
      low({ dayState: undefined }), // an older Worker
    ]) {
      api_.getDay.mockResolvedValue(d);
      expect(byId(await render(<TodayScreen />), 'incomplete-day')).toHaveLength(0);
    }
    rn.useRoute.mockReturnValue({ params: {} });
    api_.getDay.mockResolvedValue({ ...low(), date: '2026-10-11', dayState: { state: 'partial', reason: 'low' } });
    expect(byId(await render(<TodayScreen />), 'incomplete-day')).toHaveLength(0);
  });

  it('asks without a number in low-pressure mode', async () => {
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: true, status: 'ready' });
    api_.getDay.mockResolvedValue(low());
    const tree = await render(<TodayScreen />);
    const card = byId(tree, 'incomplete-day')[0]!;
    expect(card.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join(' ')).not.toMatch(/\d/);
  });
});

describe('a logged amount on Today (plan 7.7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useMeta as jest.Mock).mockReturnValue(META);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready' });
    rn.useRoute.mockReturnValue({ params: {} });
    api_.getSettings.mockResolvedValue({ id: 'u', name: 'Zoe', timezone: 'Asia/Kolkata', callTime: null, callEnabled: false, vapi: { configured: false }, lastCall: null });
  });

  it('says what it comes to in grams, and asks for a second look at one a call may have misheard', async () => {
    api_.getDay.mockResolvedValue({ ...day('2026-10-11'), items: [item(), item({ id: 'i2', quantity: 20, nutrients: { calories: 3900 }, weight: { value: 3000, unit: 'g' }, amountCheck: 'large_energy' })] });
    const tree = await render(<TodayScreen />);
    const t = all(tree);
    expect(t).toContain('2 katori · about 300 g');
    expect(t).toContain('20 katori · about 3,000 g');
    expect(byId(tree, 'amount-check-i2').length).toBeGreaterThan(0);
    expect(byId(tree, 'amount-check-i1')).toHaveLength(0);
    expect(t).toContain('More energy than one dish usually has. A misheard amount?');
  });

  it('shows no calorie or macro figure with numbers hidden, and still the amount', async () => {
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: true, status: 'ready' });
    api_.getDay.mockResolvedValue({ ...day('2026-10-11'), items: [item()] });
    const t = all(await render(<TodayScreen />));
    expect(t).toContain('2 katori · about 300 g');
    expect(t).not.toContain('kcal');
    expect(t).not.toMatch(/P 8g|390/);
  });

  it('rounds a weight as a person would say it', () => {
    expect(weightText({ value: 42, unit: 'g' })).toBe('about 40 g');
    expect(weightText({ value: 157.5, unit: 'ml' })).toBe('about 160 ml');
    expect(weightText({ value: 1.2, unit: 'g' })).toBe('about 1 g');
  });
});

describe('the insight that opens a day', () => {
  const ins = (id: string, params: Insight['params']): Insight => ({ id, priority: 2, params });
  it('is offered for a day that looks incomplete and for a total that looks like a typo', () => {
    expect(insightAction(ins('incomplete_days', { date: '2026-10-08', kcal: 700, n: 1 }))).toEqual({ label: 'Open the day', target: 'day', date: '2026-10-08' });
    expect(insightAction(ins('implausible_day', { date: '2026-10-06', kcal: 4400 }))).toEqual({ label: 'Open the day', target: 'day', date: '2026-10-06' });
  });
  it('is not offered without a date', () => {
    expect(insightAction(ins('incomplete_days', { n: 1 }))).toBeNull();
  });
  it('is what the Report tab does with it: opens Today on that day', () => {
    const action = insightAction(ins('incomplete_days', { date: '2026-10-08', kcal: 700, n: 1 }));
    expect(action).toMatchObject({ target: 'day' });
    nav.navigate('Main', { screen: 'Today', params: { date: (action as { date: string }).date } });
    expect(nav.navigate).toHaveBeenCalledWith('Main', { screen: 'Today', params: { date: '2026-10-08' } });
  });
});
