'use client'

import { LifeBuoy } from 'lucide-react'
import { useT } from '@/i18n'
import { useHelp } from '../helpStore'
import { HelpDialog } from './HelpDialog'

/**
 * Always-visible "Help & feedback" button (bottom-right of the chat) and the one Help dialog it opens.
 * White pill on the dark UI so it is the first thing the eye finds; works with the mobile drawer closed
 * and for signed-out visitors alike.
 */
export function HelpLauncher() {
  const { t } = useT()
  const open = useHelp((s) => s.open)
  const show = useHelp((s) => s.show)
  const hide = useHelp((s) => s.hide)
  return (
    <>
      <button
        type="button"
        data-testid="help-launcher"
        onClick={() => show('faq')}
        className="fixed right-5 top-2.5 z-30 flex h-11 items-center gap-2.5 rounded-full bg-white pl-4 pr-5 text-body font-semibold text-black shadow-lift ring-1 ring-black/10 transition-transform hover:scale-[1.04] active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-md:right-3 max-md:top-2"
      >
        <LifeBuoy size={18} aria-hidden />
        {t('acct.help.launch')}
      </button>
      {open ? (
        <HelpDialog key={`${open.tab}:${open.prefill?.subject ?? ''}`} initialTab={open.tab} prefill={open.prefill} onClose={hide} returnFocusTo='[data-testid="help-launcher"]' />
      ) : null}
    </>
  )
}
