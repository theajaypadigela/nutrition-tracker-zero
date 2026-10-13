/**
 * Accessibility of the report screens (WEEKLY_BREAKDOWN_PLAN.md 5.8, 11.6): every control has a name the screen reader can say, every chart
 * has a text summary, and every status is a word as well as a colour. Large-font and 360 dp layouts are checked by eye on a device; what a
 * test can check is that the words are there.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true), addListener: jest.fn(() => () => {}) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useWeeklyReport', () => ({ useWeeklyReport: jest.fn() }));
jest.mock('@/hooks/useToday', () => ({ useToday: () => '2026-10-11' }));
jest.mock('@/hooks/useHealthCard', () => ({ useHealthCard: jest.fn(() => ({ visible: true, dismiss: jest.fn() })) }));
jest.mock('@/hooks/useWeightPrompt', () => ({ useWeightPrompt: jest.fn(() => ({ visible: true, dismiss: jest.fn() })) }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u', name: 'Zoe' } }) }));
jest.mock('@/state/MetaContext', () => ({ useMeta: jest.fn() }));
jest.mock('@/api/client', () => ({ api: { addWeight: jest.fn() }, ApiError: class extends Error {}, errorMessage: (e: unknown) => String(e) }));

import type { Meta, WeeklyReport } from '@/api/types';
import { useWeeklyReport } from '@/hooks/useWeeklyReport';
import ReportScreen from '@/screens/ReportScreen';
import WeeklySummaryScreen from '@/screens/WeeklySummaryScreen';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { ThemeProvider } from '@/theme';
import metaJson from './fixtures/meta.json';
import reportsJson from './fixtures/reports.json';

const R = reportsJson as unknown as Record<string, WeeklyReport>;
const META = metaJson as unknown as Meta;

const textOf = (n: ReactTestInstance): string => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const innerText = (n: ReactTestInstance) => n.findAll((c: ReactTestInstance) => (c.type as unknown) === 'Text').map(textOf).join(' ').trim();
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

beforeEach(() => {
  jest.clearAllMocks();
  (useMeta as jest.Mock).mockReturnValue(META);
  (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready', targetSet: null, refresh: jest.fn() });
});

/** Every control on a screen: a node a person can press, with the role the screen reader announces. */
const controls = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n: ReactTestInstance) => typeof n.props.onPress === 'function' && n.props.accessibilityRole !== undefined);

const SCREENS: [string, () => React.ReactElement][] = [
  ['the Report tab', () => <ReportScreen />],
  ['All nutrients', () => <WeeklySummaryScreen />],
];

describe.each(SCREENS)('%s', (_name, screen) => {
  it.each(Object.keys(R))('names every control the screen reader can reach, for the %s week', async key => {
    (useWeeklyReport as jest.Mock).mockReturnValue({ report: { ...R[key]!, week: { ...R[key]!.week, isCurrent: true } }, locked: false, loading: false, refreshing: false, error: null, reload: jest.fn() });
    const tree = await render(screen());
    const unnamed = controls(tree)
      .filter(n => !(typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.trim() !== '') && innerText(n) === '')
      .map(n => `${String(n.props.testID ?? n.props.accessibilityRole)}`);
    expect(unnamed).toEqual([]);
  });

  it('gives every chart a text summary', async () => {
    (useWeeklyReport as jest.Mock).mockReturnValue({ report: { ...R.ordinary!, week: { ...R.ordinary!.week, isCurrent: true } }, locked: false, loading: false, refreshing: false, error: null, reload: jest.fn() });
    const tree = await render(screen());
    const images = tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'image');
    expect(images.filter(n => typeof n.props.accessibilityLabel !== 'string' || n.props.accessibilityLabel.trim() === '')).toEqual([]);
  });
});

describe('statuses are words, never colour alone', () => {
  it('shows every verdict as a label, and every day mark with words for the screen reader', async () => {
    (useWeeklyReport as jest.Mock).mockReturnValue({ report: R.ordinary!, locked: false, loading: false, refreshing: false, error: null, reload: jest.fn() });
    const tree = await render(<ReportScreen />);
    const badges = tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf);
    for (const verdict of ['On target', 'A little low', 'Below target', 'Above the limit']) expect(badges).toContain(verdict);
    const days = tree.root.findAll((n: ReactTestInstance) => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string' && /^\w+day, \w+ \d+, /.test(n.props.accessibilityLabel));
    expect(days).toHaveLength(7);
    expect(days.every(n => /logged|looks incomplete|not logged|left out|marked complete|not yet|not counted/.test(n.props.accessibilityLabel))).toBe(true);
  });

  it('reads each nutrient row as one sentence: name, amount, verdict', async () => {
    (useWeeklyReport as jest.Mock).mockReturnValue({ report: R.ordinary!, locked: false, loading: false, refreshing: false, error: null, reload: jest.fn() });
    const tree = await render(<ReportScreen />);
    const labels = tree.root.findAll((n: ReactTestInstance) => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string').map(n => n.props.accessibilityLabel as string);
    expect(labels).toContain('Protein, 59 g a day, On target');
    expect(labels).toContain('Sodium, 2,520 mg a day, Above the limit');
    expect(labels).toContain('Calcium, 520 mg a day, Below target');
  });
});
