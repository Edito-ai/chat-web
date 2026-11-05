import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/figtree'
import '@fontsource-variable/unbounded'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/noto-sans-devanagari/devanagari-400.css'
import '@fontsource/noto-sans-devanagari/devanagari-500.css'
import '@fontsource/noto-sans-devanagari/devanagari-600.css'
import './globals.css'
import { LocaleSync } from '@/components/LocaleSync'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'

const TITLE = `${SITE_NAME}: edit your video by chatting`

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: 'website', siteName: SITE_NAME, title: TITLE, description: SITE_DESCRIPTION, url: '/', images: [{ url: '/brand/og.png', width: 1200, height: 628, alt: 'Broll' }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: SITE_DESCRIPTION, images: ['/brand/og.png'] },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#070914',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <LocaleSync />
        {children}
      </body>
    </html>
  )
}
