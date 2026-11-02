import { useCallback, useState } from 'react'
import { openCheckoutTab } from './lib/checkout'

/**
 * Runs "ask the backend for a checkout URL, then open it in a new tab". The blank tab is opened synchronously in
 * the click; if the backend fails or the URL is unsafe the tab is closed again. `url` is kept so the person can
 * re-open it by hand if the tab was blocked or closed. Nothing here runs unless a button is pressed.
 */
export function useCheckout(messages: { unsafe: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [url, setUrl] = useState<string | null>(null)

  const run = useCallback(
    async (key: string, start: () => Promise<string>) => {
      setBusy(key)
      setError(null)
      setUrl(null)
      const tab = openCheckoutTab()
      try {
        const target = await start()
        const outcome = tab.navigate(target)
        if (outcome === 'unsafe') setError(new Error(messages.unsafe))
        else setUrl(target)
      } catch (e) {
        tab.abort()
        setError(e)
      } finally {
        setBusy(null)
      }
    },
    [messages.unsafe],
  )
  return { busy, error, url, run }
}
