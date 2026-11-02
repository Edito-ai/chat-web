import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  reload: () => void
}

/** Runs `fn` on mount and on `reload()`; ignores answers from a superseded or unmounted run. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({ data: undefined, error: undefined, loading: true })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    const ctl = new AbortController()
    setState((s) => ({ ...s, error: undefined, loading: true }))
    fnRef.current(ctl.signal).then(
      (data) => !ctl.signal.aborted && setState({ data, error: undefined, loading: false }),
      (error) => !ctl.signal.aborted && setState((s) => ({ ...s, error, loading: false })),
    )
    return () => ctl.abort()
  }, [tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { ...state, reload }
}
