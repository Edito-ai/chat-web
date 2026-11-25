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
// Link-preview copy (WhatsApp, X, LinkedIn).
const SHARE_TITLE = 'Broll Chat — Just say the edit. Get the video.'
const SHARE_DESCRIPTION = 'Upload a video and type what you want. Captions, B-roll, colour grade and cuts, all done by chat.'
const SHARE_IMAGE = '/brand/og-v2.png'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: 'website', siteName: SITE_NAME, title: SHARE_TITLE, description: SHARE_DESCRIPTION, url: '/', images: [{ url: SHARE_IMAGE, width: 1200, height: 630, alt: SHARE_TITLE }] },
  twitter: { card: 'summary_large_image', title: SHARE_TITLE, description: SHARE_DESCRIPTION, images: [SHARE_IMAGE] },
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
        <link rel="preconnect" href="https://accounts.google.com" />
        <link rel="dns-prefetch" href="https://accounts.google.com" />
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
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
