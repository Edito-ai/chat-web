import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/inter'
import './globals.css'
import { LocaleSync } from '@/components/LocaleSync'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'

const TITLE = `${SITE_NAME}: edit your video by chatting`

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: 'website', siteName: SITE_NAME, title: TITLE, description: SITE_DESCRIPTION, url: '/' },
  twitter: { card: 'summary_large_image', title: TITLE, description: SITE_DESCRIPTION },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050506',
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
