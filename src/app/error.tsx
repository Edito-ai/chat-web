'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { translate } from '@/i18n'
import { isDevMode } from '@/lib/friendlyError'

/** A chunk that failed to load = the app was updated while the page was open: a reload fetches the new files. */
const STALE = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i

/**
 * The page a person sees when something throws while a screen is drawn (instead of Next's bare "Application error"). In production it
 * is one calm sentence with a reload button; in development the error itself is shown too, so it is not hidden behind this page.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = STALE.test(`${error.name} ${error.message}`)
  useEffect(() => {
    console.error(error) // the console keeps the real error in every environment
  }, [error])
  return (
    <main className="grid min-h-dvh place-items-center bg-surface-0 px-5 text-center text-ink-1">
      <div role="alert" data-testid="error-page" className="max-w-sm space-y-4">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-danger-soft text-danger">
          <AlertTriangle size={22} aria-hidden />
        </span>
        <h1 className="font-display text-heading font-bold text-ink-0">{translate('en', 'err.page.title')}</h1>
        <p className="text-body text-ink-3">{translate('en', stale ? 'err.page.stale' : 'err.page.body')}</p>
        {error.digest && <p className="text-caption text-ink-4">{translate('en', 'common.reference', { id: error.digest })}</p>}
        {isDevMode() && (
          <pre data-testid="error-dev" className="max-h-48 overflow-auto rounded-xl bg-black/30 p-3 text-left font-mono text-caption text-danger">
            {error.name}: {error.message}
          </pre>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => (stale ? window.location.reload() : reset())}
            className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-body font-semibold text-black"
          >
            {translate('en', 'err.page.reload')}
          </button>
          <Link href="/" className="inline-flex h-10 items-center rounded-xl border border-line bg-surface-3 px-4 text-body font-semibold text-ink-0 hover:bg-surface-4">
            {translate('en', 'err.page.home')}
          </Link>
        </div>
      </div>
    </main>
  )
}
