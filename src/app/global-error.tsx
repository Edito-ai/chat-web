'use client'

import { isDevMode } from '@/lib/friendlyError'

/** The last net: an error in the root layout itself (it replaces the layout, so it brings its own <html>, and no app styles or i18n). */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#070914', color: '#e8eaf6', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center' }}>
          <div role="alert" style={{ maxWidth: 360 }}>
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Something went wrong</h1>
            <p style={{ opacity: 0.7, margin: '0 0 16px' }}>Please reload the page. If it keeps happening, try again in a few minutes.</p>
            {error.digest && <p style={{ opacity: 0.5, fontSize: 12 }}>Reference: {error.digest}</p>}
            {isDevMode() && <pre style={{ textAlign: 'left', color: '#ff8a8a', whiteSpace: 'pre-wrap', fontSize: 12 }}>{error.name}: {error.message}</pre>}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the router is not available in the root error page */}
            <a href="/" style={{ color: '#ff9e8c' }}>Reload</a>
          </div>
        </main>
      </body>
    </html>
  )
}
