import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Captions, Clapperboard, Download, Palette, Scissors, Send, Upload } from 'lucide-react'
import { Logo } from '@/components/ui'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'

const steps = [
  { icon: Upload, title: 'Upload', body: 'Add one or more videos. They go straight to secure storage, large files in resumable parts.' },
  { icon: Send, title: 'Describe the edit', body: 'Say what you want in your own words, in English or Hindi: "cut the pauses, add captions, warm colour grade".' },
  { icon: Download, title: 'Get the video back', body: 'Watch progress as it works, then play the finished video and download it. Ask for changes in the same chat.' },
]

const features = [
  { icon: Captions, title: 'Captions', body: 'Spoken words turned into on-screen captions in a style you ask for.' },
  { icon: Clapperboard, title: 'B-roll', body: 'Cutaway footage placed over your talking shots where it helps the story.' },
  { icon: Palette, title: 'Colour grade', body: 'A consistent look across your clips, from "cinematic" to "bright and clean".' },
  { icon: Scissors, title: 'Cuts', body: 'Dead air and fumbles trimmed so the video keeps moving.' },
]

export const metadata: Metadata = { alternates: { canonical: '/' } }

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any (web browser)',
}

const primaryCta =
  'inline-flex h-11 items-center gap-2 rounded-lg bg-ink-0 px-5 text-body font-semibold text-surface-0 hover:bg-white'

export default function LandingPage() {
  return (
    <div className="app-shell min-h-full text-ink-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Main">
          <Link href="/login" className="rounded-lg px-3.5 py-2 text-body font-semibold text-ink-1 hover:bg-white/[0.06] hover:text-ink-0">
            Log in
          </Link>
          <Link href="/chat" className="rounded-lg bg-ink-0 px-3.5 py-2 text-body font-semibold text-surface-0 hover:bg-white">
            Open the app
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 pb-20 pt-16 sm:pt-24">
          <h1 className="max-w-3xl text-balance text-[2.5rem] font-bold leading-[1.1] tracking-[-0.03em] text-ink-0 sm:text-[3.5rem]">
            Upload a video. Describe the edit. Get the finished video back.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-ink-2">
            {SITE_NAME} is a chat that edits your video for you. No timeline to learn: tell it what you want, and it adds the
            captions, B-roll and colour, trims the cuts, and hands you a video you can download.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/chat" className={primaryCta}>
              Start editing <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="#how-it-works" className="inline-flex h-11 items-center rounded-lg border border-line px-5 text-body font-semibold text-ink-1 hover:bg-white/[0.06]">
              How it works
            </Link>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-5xl scroll-mt-6 px-5 pb-20" aria-labelledby="how-title">
          <h2 id="how-title" className="text-[1.75rem] font-semibold tracking-[-0.02em] text-ink-0">How it works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line bg-surface-1 p-5">
                <div className="flex items-center gap-3 text-ink-0">
                  <s.icon size={18} strokeWidth={1.75} aria-hidden />
                  <span className="text-label text-ink-3">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-title font-semibold text-ink-0">{s.title}</h3>
                <p className="mt-2 text-body text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-20" aria-labelledby="what-title">
          <h2 id="what-title" className="text-[1.75rem] font-semibold tracking-[-0.02em] text-ink-0">What it does</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f.title} className="flex gap-4 rounded-xl border border-line bg-surface-1 p-5">
                <f.icon size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-0" aria-hidden />
                <div>
                  <h3 className="text-title font-semibold text-ink-0">{f.title}</h3>
                  <p className="mt-1 text-body text-ink-2">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-24">
          <div className="rounded-2xl border border-line-strong bg-surface-2 p-8 text-center sm:p-12">
            <h2 className="text-[1.75rem] font-semibold tracking-[-0.02em] text-ink-0">Try your first edit</h2>
            <p className="mx-auto mt-3 max-w-xl text-body text-ink-2">Sign in, drop in a video and tell it what you want.</p>
            <Link href="/chat" className={`mt-6 ${primaryCta}`}>
              Open the app <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl border-t border-line px-5 py-8 text-label text-ink-3">
        {SITE_NAME}. Edit videos by chatting.
      </footer>
    </div>
  )
}
