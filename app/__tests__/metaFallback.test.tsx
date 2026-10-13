/**
 * What the forms are built from when /meta has not answered: the whole of the Worker's catalogue (a shorter list would save the rest of
 * a food's nutrients as unknown), kept equal to the Worker's own, and asked for again, a few times, if the first ask failed.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { LOGGED_UNITS, BASE_UNITS, MEALS } from '../../worker/src/domain/units';
import metaJson from './fixtures/meta.json';

jest.mock('@/api/client', () => ({ api: { meta: jest.fn() }, errorMessage: (e: unknown) => String(e) }));

import { api } from '@/api/client';
import type { Meta } from '@/api/types';
import { FALLBACK_META, MetaProvider, useMeta } from '@/state/MetaContext';

const api_ = api as unknown as { meta: jest.Mock };

describe('the fallback catalogue', () => {
  // The fixture is the Worker's own catalogue (made by worker/scripts/make-app-fixtures.ts, and checked against it by the Worker's tests),
  // so this fails when the Worker gains a nutrient the app's fallback does not have.
  it('holds every nutrient the Worker has, in its order, with its units, kinds and references', () => {
    expect(FALLBACK_META.nutrients).toEqual(metaJson.nutrients);
    expect(FALLBACK_META.nutrients).toHaveLength(21);
  });

  it('holds the Worker\'s units, base units and meals', () => {
    expect(FALLBACK_META.units).toEqual([...LOGGED_UNITS]);
    expect(FALLBACK_META.baseUnits).toEqual([...BASE_UNITS]);
    expect(FALLBACK_META.meals).toEqual([...MEALS]);
  });
});

describe('MetaProvider', () => {
  let seen: Meta;
  function Probe() {
    seen = useMeta();
    return null;
  }
  const FULL: Meta = { ...FALLBACK_META, engineVersion: '1.1.0', nutrients: FALLBACK_META.nutrients.slice(0, 3) };
  let tree: TestRenderer.ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      tree = TestRenderer.create(
        <MetaProvider>
          <Probe />
        </MetaProvider>,
      );
    });
  };
  const wait = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
    await act(async () => {});
  };

  beforeEach(() => {
    jest.useFakeTimers();
    api_.meta.mockReset();
  });
  afterEach(async () => {
    await act(async () => {
      tree?.unmount();
    });
    tree = undefined;
    jest.useRealTimers();
  });

  it('serves the Worker\'s catalogue when it answers, and asks once', async () => {
    api_.meta.mockResolvedValue(FULL);
    await mount();
    expect(seen).toBe(FULL);
    await wait(60_000);
    expect(api_.meta).toHaveBeenCalledTimes(1);
  });

  it('serves the fallback while it cannot be reached, and the Worker\'s own as soon as an asking again gets through', async () => {
    api_.meta.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(FULL);
    await mount();
    expect(seen).toBe(FALLBACK_META);
    expect(seen.nutrients).toHaveLength(21);
    await wait(2_000); // the first retry: still offline
    expect(api_.meta).toHaveBeenCalledTimes(2);
    expect(seen).toBe(FALLBACK_META);
    await wait(6_000); // the second retry gets through
    expect(api_.meta).toHaveBeenCalledTimes(3);
    expect(seen).toBe(FULL);
  });

  it('gives up after a few tries rather than asking for ever', async () => {
    api_.meta.mockRejectedValue(new Error('offline'));
    await mount();
    for (const ms of [2_000, 6_000, 15_000, 45_000]) await wait(ms);
    expect(api_.meta).toHaveBeenCalledTimes(5); // the first ask and four retries
    await wait(600_000);
    expect(api_.meta).toHaveBeenCalledTimes(5);
    expect(seen).toBe(FALLBACK_META);
  });
});
