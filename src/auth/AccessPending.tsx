'use client'

import { useEffect, useState } from 'react'
import { Loader2, Mail, MessageSquare, Phone } from 'lucide-react'
import { useT } from '@/i18n'
import { Button, LogoMark, Wordmark } from '@/components/ui'
import { BrandTile } from '@/components/BrandTile'
import { useChat } from '@/chat/chatStore'
import { useAccess } from './access'
import { useAuth } from './authStore'

/** How often the screen asks again, so an approval shows up without the person doing anything. */
const RECHECK_MS = 20_000

/** A WhatsApp chat with `phone` (digits only; a bare 10-digit number is Indian, so 91 goes in front) and a first message ready to send. */
export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '')
  const full = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/**
 * What a new account sees until an admin approves it: why it cannot use the product yet and how to get access.
 * It asks the server again by itself, so the chat opens as soon as the approval is given.
 */
export function AccessPending() {
  const { t } = useT()
  const contact = useAccess((s) => s.contact)
  const user = useAuth((s) => s.user)
  const [checking, setChecking] = useState(false)
  const [still, setStill] = useState(false)

  const check = async () => {
    setChecking(true)
    await useAccess.getState().check()
    setChecking(false)
    setStill(useAccess.getState().status === 'pending')
  }
  useEffect(() => {
    const id = setInterval(() => void useAccess.getState().check(), RECHECK_MS)
    return () => clearInterval(id)
  }, [])
  const signOut = () => {
    useChat.getState().reset()
    useAccess.getState().reset()
    useAuth.getState().logout()
  }
  const rows = [
    { id: 'mail', href: `mailto:${contact.email}`, label: t('access.mail'), value: contact.email, Icon: Mail, external: false },
    { id: 'call', href: `tel:${contact.phone}`, label: t('access.call'), value: contact.phone, Icon: Phone, external: false },
    {
      id: 'message',
      href: whatsappLink(contact.phone, t('access.whatsappText', { email: user?.email ?? '' })),
      label: t('access.message'),
      value: contact.phone,
      Icon: MessageSquare,
      external: true,
    },
  ] as const

  return (
    <main
      data-testid="access-pending"
      className="relative isolate flex min-h-full w-full flex-col overflow-hidden bg-[linear-gradient(to_top_right,#0e1020_0%,#2b3a5e_24%,#8a1c3a_44%,#c0202f_56%,#e4776d_76%,#ffc4ae_100%)] text-ink-1"
    >
      <div aria-hidden className="absolute -right-32 -top-32 -z-10 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_226_210/0.5),transparent)] blur-2xl" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_0%_100%,rgb(5_6_14/0.5),transparent_60%)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 -z-10 hidden opacity-[0.10] lg:block">
        <LogoMark size={520} className="bg-white" />
      </div>
      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <span className="text-white">
          <Wordmark height={20} />
        </span>
      </header>
      <div className="relative flex flex-1 flex-col items-center justify-center px-5 pb-8">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-white/15 bg-[#090c1a]/80 p-6 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl sm:p-8">
          <BrandTile size={60} className="mx-auto" />
          <div className="space-y-2 text-center">
            <h1 className="font-display text-[1.45rem] font-bold leading-tight tracking-[-0.02em] text-ink-0">{t('access.title')}</h1>
            <p className="text-body text-ink-3">{t('access.body')}</p>
          </div>
          <ul className="space-y-2">
            {rows.map(({ id, href, label, value, Icon, external }) => (
              <li key={id}>
                <a
                  data-testid={`access-${id}`}
                  href={href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="flex items-center gap-3 rounded-2xl border border-white/15 bg-surface-1 px-4 py-3 transition-colors hover:border-accent-line"
                >
                  <Icon size={18} className="shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-caption text-ink-3">{label}</span>
                    <span className="block truncate text-body font-medium text-ink-0">{value}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <Button variant="primary" className="h-11 w-full" onClick={() => void check()} disabled={checking} data-testid="access-check">
              {checking && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {t('access.check')}
            </Button>
            {still && !checking && (
              <p role="status" className="text-center text-label text-ink-3">
                {t('access.stillWaiting')}
              </p>
            )}
            <Button variant="ghost" className="h-10 w-full" onClick={signOut} data-testid="access-signout">
              {t('access.signOut')}
            </Button>
          </div>
          {user?.email && <p className="text-center text-caption text-ink-4">{t('access.signedInAs', { email: user.email })}</p>}
        </div>
      </div>
    </main>
  )
}
