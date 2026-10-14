import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { RangeReport, Meta } from '@/api/types';
import { Button, Segmented } from '@/components/kit';
import { RangeIntakeCard } from '@/components/report/RangeIntakeCard';
import { ThemeProvider } from '@/theme';
import { reportBounds, shiftReport } from '@/utils/reportRange';
import metaJson from './fixtures/meta.json';

const meta = metaJson as unknown as Meta;
const report: RangeReport = {
  range: { from: '2024-02-01', to: '2024-02-29', through: '2024-02-29' },
  display: { numbersHidden: false },
  coverage: { calendarDays: 29, loggedDays: 2, skippedDays: 0, itemCount: 3, pendingItems: 1 },
  nutrients: meta.nutrients.map((n, i) => ({ nutrient: n.key, total: i === 0 ? 400 : i === 1 ? 0 : null, meanPerLoggedDay: i === 0 ? 200 : i === 1 ? 0 : null, knownItems: i < 2 ? 2 : 0, missingItems: i < 2 ? 1 : 3, isLowerBound: i < 2 })),
};

describe('report periods', () => {
  const custom = { from: '2023-11-02', to: '2024-03-09' };
  it('uses calendar days, Monday-first weeks, leap months and calendar years', () => {
    expect(reportBounds('day', '2024-02-29', custom)).toEqual({ from: '2024-02-29', to: '2024-02-29' });
    expect(reportBounds('week', '2024-03-03', custom)).toEqual({ from: '2024-02-26', to: '2024-03-03' });
    expect(reportBounds('month', '2024-02-29', custom)).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(reportBounds('year', '2024-02-29', custom)).toEqual({ from: '2024-01-01', to: '2024-12-31' });
    expect(reportBounds('custom', '2024-02-29', custom)).toEqual(custom);
    expect(shiftReport('month', '2024-03-31', -1)).toBe('2024-02-01');
    expect(shiftReport('year', '2024-02-29', -1)).toBe('2023-01-01');
    expect(shiftReport('week', '2024-01-01', -1)).toBe('2023-12-25');
  });
});

it('expands to every nutrient, switches totals to logged-day averages, and collapses again', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<ThemeProvider><RangeIntakeCard report={report} nutrients={meta.nutrients} /></ThemeProvider>); });
  const rows = () => tree.root.findAll(n => n.type === 'View' && String(n.props.testID).startsWith('range-nutrient-'));
  expect(rows()).toHaveLength(4);
  expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Calories, At least 400 kcal, 1 entries missing this nutrient').length).toBeGreaterThan(0);
  await act(async () => tree.root.findByType(Segmented).props.onChange('average'));
  expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Calories, At least 200 kcal, 1 entries missing this nutrient').length).toBeGreaterThan(0);
  await act(async () => tree.root.findByType(Button).props.onPress());
  expect(rows()).toHaveLength(meta.nutrients.length);
  expect(rows().find(n => n.props.testID === 'range-nutrient-vitaminD')?.props.accessibilityLabel).toContain('Unknown');
  expect(rows().find(n => n.props.testID === 'range-nutrient-protein')?.props.accessibilityLabel).toContain('0 g');
  await act(async () => tree.root.findByType(Button).props.onPress());
  expect(rows()).toHaveLength(4);
  await act(async () => tree.unmount());
});

it('renders no nutrient amounts when numbers are hidden', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<RangeIntakeCard report={{ ...report, display: { numbersHidden: true } }} nutrients={meta.nutrients} />); });
  expect(tree.toJSON()).toBeNull();
  await act(async () => tree.unmount());
});
