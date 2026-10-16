import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useAsync } from '@/hooks/useAsync';

jest.mock('@/api/client', () => ({ errorMessage: (e: Error) => e.message }));

let latest: ReturnType<typeof useAsync<string>>;
const requests: { resolve: (value: string) => void; reject: (e: Error) => void }[] = [];
function Harness({ date }: { date: string }) {
  latest = useAsync(() => new Promise<string>((resolve, reject) => requests.push({ resolve, reject })), [date]);
  return null;
}
let tree: TestRenderer.ReactTestRenderer;
beforeEach(() => requests.splice(0));
afterEach(async () => { await act(async () => tree.unmount()); });

it('keeps the same date visible during refresh but clears it immediately for a different date', async () => {
  await act(async () => { tree = TestRenderer.create(<Harness date="2026-10-16" />); });
  await act(async () => requests[0]!.resolve('Friday meals'));
  expect(latest.data).toBe('Friday meals');
  act(() => { latest.reload(); });
  expect(latest.data).toBe('Friday meals');
  await act(async () => tree.update(<Harness date="2026-10-15" />));
  expect(latest.data).toBeUndefined();
  await act(async () => requests[1]!.resolve('Outdated Friday refresh'));
  expect(latest.data).toBeUndefined();
  await act(async () => requests[2]!.resolve('Thursday meals'));
  expect(latest.data).toBe('Thursday meals');
  expect(latest.loading).toBe(false);
});

it('never shows the old date after the new date fails to load', async () => {
  await act(async () => { tree = TestRenderer.create(<Harness date="2026-10-16" />); });
  await act(async () => requests[0]!.resolve('Friday meals'));
  await act(async () => tree.update(<Harness date="2026-10-15" />));
  await act(async () => requests[1]!.reject(new Error('Offline')));
  expect(latest.data).toBeUndefined();
  expect(latest.error).toBe('Offline');
  expect(latest.loading).toBe(false);
  await act(async () => tree.update(<Harness date="2026-10-14" />));
  expect(latest.error).toBeNull();
});


it('keeps reload stable so navigation callbacks always refresh the current inputs', async () => {
  await act(async () => { tree = TestRenderer.create(<Harness date="2026-10-16" />); });
  const reload = latest.reload;
  await act(async () => tree.update(<Harness date="2026-10-15" />));
  expect(latest.reload).toBe(reload);
  act(() => { reload(); });
  await act(async () => requests[2]!.resolve('Current Thursday meals'));
  expect(latest.data).toBe('Current Thursday meals');
  expect(latest.loading).toBe(false);
});
