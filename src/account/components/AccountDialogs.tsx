'use client'

import { useAccount } from '../accountStore'
import { BillingDialog } from './BillingDialog'
import { HelpDialog } from './HelpDialog'
import { LegalDialog } from './LegalDialog'
import { UsageDialog } from './UsageDialog'

/** Mounts whichever account dialog the store says is open (one at a time). */
export function AccountDialogs() {
  const dialog = useAccount((s) => s.dialog)
  if (dialog === 'usage') return <UsageDialog />
  if (dialog === 'billing') return <BillingDialog />
  if (dialog === 'help') return <HelpDialog />
  if (dialog === 'legal') return <LegalDialog />
  return null
}
