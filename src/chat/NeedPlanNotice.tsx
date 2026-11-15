'use client'

import { Mail, MessageSquare } from 'lucide-react'
import { useT } from '@/i18n'
import { useAuth } from '@/auth/authStore'
import { useAccess } from '@/auth/access'
import { whatsappLink } from '@/auth/AccessPending'
import { TID } from './testIds'

/**
 * Shown when the server refused an edit because the account has no plan or credit left. There is no self-serve free
 * credit any more: plans are given by our team, so this says who to ask (mail or WhatsApp) instead of offering a claim form.
 */
export function NeedPlanNotice({ show }: { show: boolean }) {
  const { t } = useT()
  const contact = useAccess((s) => s.contact)
  const email = useAuth((s) => s.user?.email ?? '')
  if (!show) return null
  return (
    <div className="shrink-0">
      <section
        role="region"
        aria-label={t('plan.need.region')}
        data-testid={TID.needCredit}
        className="border-b border-accent-line bg-gradient-to-r from-accent/45 via-accent/15 to-warning/40 px-3 py-2.5 sm:px-4"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 basis-56 text-body font-semibold text-ink-0">{t('plan.need')}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent-line bg-surface-0/70 px-3 text-label text-ink-0 hover:bg-surface-0"
            >
              <Mail size={14} aria-hidden /> {contact.email}
            </a>
            <a
              href={whatsappLink(contact.phone, t('plan.need.whatsappText', { email }))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] px-3 text-label font-semibold text-white hover:brightness-110"
            >
              <MessageSquare size={14} aria-hidden /> {t('access.message')}
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
