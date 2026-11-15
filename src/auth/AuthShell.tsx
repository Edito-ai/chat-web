import type { ReactNode } from 'react'
import { useT } from '@/i18n'
import { LogoMark, Wordmark } from '@/components/ui'

/**
 * The page every signed-out screen sits on: the sunset gradient, the big faded logo, the wordmark on top and the tagline under
 * the card. The sign-in screen and the onboarding screen share it, so they read as one place.
 */
export function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { t } = useT()
  return (
    <main className="relative isolate flex min-h-full w-full flex-col overflow-hidden bg-[linear-gradient(to_top_right,#0e1020_0%,#2b3a5e_24%,#8a1c3a_44%,#c0202f_56%,#e4776d_76%,#ffc4ae_100%)] text-ink-1">
      <div aria-hidden className="absolute -right-32 -top-32 -z-10 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_226_210/0.5),transparent)] blur-2xl" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_0%_100%,rgb(5_6_14/0.5),transparent_60%)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 -z-10 hidden animate-orb-idle opacity-[0.10] lg:block">
        <LogoMark size={520} className="bg-white" />
      </div>

      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <span className="text-white">
          <Wordmark height={20} />
        </span>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-8 sm:px-5">
        <div
          className={`w-full ${wide ? 'max-w-md' : 'max-w-sm'} rounded-3xl border border-white/15 bg-[#090c1a]/80 p-6 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl sm:p-8`}
        >
          {children}
        </div>
        <p className="mt-6 max-w-sm text-center font-display text-caption font-medium leading-relaxed text-white/85">{t('chat.empty.title')}</p>
      </div>
    </main>
  )
}
