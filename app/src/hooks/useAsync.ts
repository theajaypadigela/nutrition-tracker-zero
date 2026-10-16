import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '@/api/client';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** Re-runs the loader; keeps showing the previous data meanwhile. */
  reload: () => Promise<void>;
  setData: (data: T) => void;
}

/** Retains data during a refresh, but never shows a previous date/account's result under new inputs. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  // Identity changes during render, before the new effect starts its request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const key = useMemo(() => ({}), deps);
  const currentKey = useRef(key);
  currentKey.current = key;
  const [result, setResult] = useState<{ key: object; data: T }>();
  const [failure, setFailure] = useState<{ key: object; message: string }>();
  const [pending, setPending] = useState<{ key: object; loading: boolean }>({ key, loading: true });
  const runId = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    const requestKey = currentKey.current;
    const id = ++runId.current;
    setPending({ key: requestKey, loading: true });
    try {
      const data = await loadRef.current();
      if (id === runId.current) {
        setResult({ key: requestKey, data });
        setFailure(undefined);
      }
    } catch (e) {
      if (id === runId.current) setFailure({ key: requestKey, message: errorMessage(e) });
    } finally {
      if (id === runId.current) setPending({ key: requestKey, loading: false });
    }
  }, []);

  const setData = useCallback((data: T) => setResult({ key: currentKey.current, data }), []);

  useEffect(() => {
    const requests = runId;
    reload();
    return () => { ++requests.current; };
  }, [key, reload]);

  return {
    data: result?.key === key ? result.data : undefined,
    error: failure?.key === key ? failure.message : null,
    loading: pending.key !== key || pending.loading,
    reload,
    setData,
  };
}
