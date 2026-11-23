import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import '@fontsource-variable/figtree'
import '@fontsource-variable/unbounded'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/noto-sans-devanagari/devanagari-400.css'
import '@fontsource/noto-sans-devanagari/devanagari-500.css'
import '@fontsource/noto-sans-devanagari/devanagari-600.css'
import './globals.css'
import { LocaleSync } from '@/components/LocaleSync'
import { ServerWaking } from '@/components/ServerWaking'
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
      <head>
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '1701744898277137');
            fbq('track', 'PageView');
          `}
        </Script>
      </head>
      <body>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            alt=""
            src="https://www.facebook.com/tr?id=1701744898277137&ev=PageView&noscript=1"
          />
        </noscript>
        <LocaleSync />
        <ServerWaking />
        {children}
      </body>
    </html>
  )
}
