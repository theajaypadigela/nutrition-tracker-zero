/**
 * Marking a day complete or incomplete is off for now (src/config/features.ts). Today draws no row, sheet or card for it, even for a day
 * an older Worker still reports as marked or as looking incomplete, and the report offers no question about it. dayStatus.test.tsx
 * keeps the way back covered by running the same screens with the switch on.
 */
import React from 'react';
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
jest.mock('@/api/client', () => ({
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  api: { getSettings: jest.fn(), getDay: jest.fn(), setDayStatus: jest.fn(), clearDayStatus: jest.fn(), updateSettings: jest.fn(), deleteItem: jest.fn(), updateItem: jest.fn() },
}));

import { api } from '@/api/client';
import type { Day, Insight, Meta } from '@/api/types';
import { FEATURES } from '@/config/features';
import TodayScreen from '@/screens/TodayScreen';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { ThemeProvider } from '@/theme';
import { visibleInsights } from '@/utils/insights';
import metaJson from './fixtures/meta.json';

const META = { units: [], meals: ['breakfast', 'lunch', 'snack', 'dinner'], baseUnits: [], ...(metaJson as object) } as unknown as Meta;
const rn = jest.requireMock('@react-navigation/native') as { useRoute: jest.Mock };
const api_ = api as unknown as Record<string, jest.Mock>;

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id);

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

const day = (over: Partial<Day> = {}): Day => ({
  date: '2026-10-08',
  status: null,
  items: [],
  totals: { calories: { value: 694, missingItems: 0 } },
  goals: { calories: 2150 },
  customGoals: [],
  pendingCount: 0,
  calls: [],
  ...over,
});

describe('day marking is switched off', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useMeta as jest.Mock).mockReturnValue(META);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready' });
    rn.useRoute.mockReturnValue({ params: { date: '2026-10-08' } });
    api_.getSettings.mockResolvedValue({ id: 'u', name: 'Zoe', timezone: 'Asia/Kolkata', callTime: null, callEnabled: false, vapi: { configured: false }, lastCall: null });
  });

  it('is off in the product', () => {
    expect(FEATURES.dayCompletion).toBe(false);
  });

  it('draws no "Mark this day" row, sheet or "looks incomplete" card on Today', async () => {
    api_.getDay.mockResolvedValue(day({ dayState: { state: 'partial', reason: 'low' } }));
    const tree = await render(<TodayScreen />);
    expect(all(tree)).toContain('Remaining');
    expect(byId(tree, 'mark-day')).toHaveLength(0);
    expect(byId(tree, 'day-status-sheet')).toHaveLength(0);
    expect(byId(tree, 'incomplete-day')).toHaveLength(0);
    expect(all(tree)).not.toMatch(/Mark this day|looks incomplete|Everything you ate|It is complete|Leave this day out/i);
  });

  it('shows a mark an older Worker still reports as nothing at all', async () => {
    for (const status of ['skip', 'partial', 'complete'] as const) {
      api_.getDay.mockResolvedValue(day({ status }));
      const t = all(await render(<TodayScreen />));
      expect(t).not.toMatch(/Left out|Marked incomplete|Marked complete/);
    }
  });

  it('never calls the mark routes', async () => {
    api_.getDay.mockResolvedValue(day({ dayState: { state: 'partial', reason: 'low' } }));
    await render(<TodayScreen />);
    expect(api_.setDayStatus).not.toHaveBeenCalled();
    expect(api_.clearDayStatus).not.toHaveBeenCalled();
  });

  it('leaves the "looks incomplete" question out of the insights, and keeps every other insight in order', () => {
    const ins = (id: string): Insight => ({ id, priority: 2, params: {} });
    const list = [ins('low_intake'), ins('incomplete_days'), ins('few_days')];
    expect(visibleInsights(list).map(i => i.id)).toEqual(['low_intake', 'few_days']);
    const was = FEATURES.dayCompletion;
    FEATURES.dayCompletion = true;
    try {
      expect(visibleInsights(list).map(i => i.id)).toEqual(['low_intake', 'incomplete_days', 'few_days']);
    } finally {
      FEATURES.dayCompletion = was;
    }
  });
});
