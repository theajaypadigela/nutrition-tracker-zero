import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/api/client';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** Re-runs the loader; keeps showing the previous data meanwhile. */
  reload: () => Promise<void>;
  setData: (data: T) => void;
}

/** Runs `load` on mount and whenever `deps` change; ignores results from superseded runs. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const runId = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    const id = ++runId.current;
    setLoading(true);
    try {
      const result = await loadRef.current();
      if (id === runId.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (id === runId.current) setError(errorMessage(e));
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}
