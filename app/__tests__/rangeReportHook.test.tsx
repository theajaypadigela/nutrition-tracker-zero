import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@/api/client', () => ({ api: { getRangeReport: jest.fn() }, ApiError: class extends Error {}, errorMessage: (e: unknown) => String(e) }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: jest.fn() }));

import { api } from '@/api/client';
import { useHealth } from '@/state/HealthContext';
import { useProfile } from '@/state/ProfileContext';
import { useRangeReport } from '@/hooks/useRangeReport';
import type { RangeReport } from '@/api/types';

let latest: ReturnType<typeof useRangeReport>;
function Harness({ from, to }: { from: string; to: string }) {
  latest = useRangeReport(from, to);
  return null;
}
const fixture = (from: string): RangeReport => ({
  range: { from, to: from, through: from }, display: { numbersHidden: false },
  coverage: { calendarDays: 1, loggedDays: 1, skippedDays: 0, itemCount: 1, pendingItems: 0 },
  nutrients: [{ nutrient: 'calories', total: 123, meanPerLoggedDay: 123, knownItems: 1, missingItems: 0, isLowerBound: false }],
});

beforeEach(() => {
  jest.clearAllMocks();
  (useHealth as jest.Mock).mockReturnValue({ status: 'ready', revision: 1, numbersHidden: false });
  (useProfile as jest.Mock).mockReturnValue({ profile: { id: 'one' } });
});

it('clears old figures when dates change and ignores a superseded request', async () => {
  const resolves: ((report: RangeReport) => void)[] = [];
  (api.getRangeReport as jest.Mock).mockImplementation(() => new Promise(resolve => resolves.push(resolve)));
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<Harness from="2024-01-01" to="2024-01-01" />); });
  await act(async () => resolves[0]!(fixture('2024-01-01')));
  expect(latest.report?.nutrients[0]?.total).toBe(123);
  await act(async () => tree.update(<Harness from="2024-02-01" to="2024-02-01" />));
  expect(latest.report).toBeNull();
  await act(async () => tree.update(<Harness from="2024-03-01" to="2024-03-01" />));
  await act(async () => resolves[1]!(fixture('2024-02-01')));
  expect(latest.report).toBeNull();
  await act(async () => resolves[2]!(fixture('2024-03-01')));
  expect(latest.report?.range.from).toBe('2024-03-01');
  await act(async () => tree.unmount());
});

it('clears the previous profile while the next profile loads and immediately hides amounts after a setting change', async () => {
  (api.getRangeReport as jest.Mock).mockResolvedValue(fixture('2024-01-01'));
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<Harness from="2024-01-01" to="2024-01-01" />); });
  expect(latest.report).not.toBeNull();
  (useProfile as jest.Mock).mockReturnValue({ profile: { id: 'two' } });
  (api.getRangeReport as jest.Mock).mockImplementation(() => new Promise(() => {}));
  await act(async () => tree.update(<Harness from="2024-01-01" to="2024-01-01" />));
  expect(latest.report).toBeNull();
  (useHealth as jest.Mock).mockReturnValue({ status: 'ready', revision: 2, numbersHidden: true });
  await act(async () => tree.update(<Harness from="2024-01-01" to="2024-01-01" />));
  expect(latest.hidden).toBe(true);
  expect(latest.report).toBeNull();
  await act(async () => tree.unmount());
});
