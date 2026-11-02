import type { AccountApi } from '@/account/accountApi'
import type { Entitlement, SubscriptionInfo, SubscriptionUsage, TokenUsage } from '@/account/types'

/** Mock account data for /dev/preview. Money calls never reach any backend: they throw. */

const day = 24 * 60 * 60 * 1000
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString()

export const ACCOUNT_SCENARIOS = ['acct-free', 'acct-weekly', 'acct-trial', 'acct-exceeded', 'acct-cancelend', 'acct-failed'] as const
export type AccountScenario = (typeof ACCOUNT_SCENARIOS)[number]
export const isAccountScenario = (s: string): s is AccountScenario => (ACCOUNT_SCENARIOS as readonly string[]).includes(s)

const sub = (over: Partial<SubscriptionInfo>): SubscriptionInfo => ({
  id: 'sub_preview',
  tier: 'creator',
  status: 'active',
  currentPeriodStart: iso(-12 * day),
  currentPeriodEnd: iso(18 * day),
  trialEnd: null,
  cancelAtPeriodEnd: false,
  lastPaymentError: null,
  isTrial: false,
  ...over,
})

const tokens = (over: Partial<TokenUsage>): TokenUsage => ({
  usedTokens: 14_200_000,
  limitTokens: 40_000_000,
  percentageUsed: 35.5,
  periodStart: iso(-12 * day),
  periodEnd: iso(18 * day),
  isWeekly: false,
  isExceeded: false,
  ...over,
})

interface Fixture {
  entitlement: Entitlement | null
  subscription: SubscriptionInfo | null
  tokenUsage: TokenUsage | null
  footage: number
  footageCap: number | null
  prompts: number
  weeklyPass: boolean
  credit: { enabled: boolean; claimed: boolean; tokens: number; usd: number; phoneMasked: string | null }
}

function fixture(s: AccountScenario): Fixture {
  const none = { enabled: false, claimed: false, tokens: 0, usd: 0, phoneMasked: null }
  switch (s) {
    case 'acct-free':
      return { entitlement: null, subscription: null, tokenUsage: null, footage: 0, footageCap: null, prompts: 0, weeklyPass: false, credit: { enabled: true, claimed: false, tokens: 1_500_000, usd: 2, phoneMasked: null } }
    case 'acct-weekly':
      return { entitlement: { kind: 'weekly', tier: 'weekly', isTrial: false, expiresAt: iso(4 * day + 3 * 3_600_000) }, subscription: null, tokenUsage: tokens({ usedTokens: 2_100_000, limitTokens: 10_000_000, percentageUsed: 21, isWeekly: true, periodStart: iso(-3 * day), periodEnd: iso(4 * day) }), footage: 1.4, footageCap: null, prompts: 7, weeklyPass: true, credit: { enabled: true, claimed: true, tokens: 1_500_000, usd: 2, phoneMasked: '+91 98xxxxxx21' } }
    case 'acct-trial':
      return { entitlement: { kind: 'monthly', tier: 'creator', isTrial: true, expiresAt: iso(21 * day) }, subscription: sub({ status: 'trialing', isTrial: true, trialEnd: iso(21 * day), currentPeriodEnd: iso(21 * day) }), tokenUsage: tokens({ usedTokens: 900_000, percentageUsed: 2.3 }), footage: 0.6, footageCap: 5, prompts: 3, weeklyPass: false, credit: none }
    case 'acct-exceeded':
      return { entitlement: { kind: 'monthly', tier: 'studio', isTrial: false, expiresAt: iso(9 * day) }, subscription: sub({ tier: 'studio', currentPeriodEnd: iso(9 * day) }), tokenUsage: tokens({ usedTokens: 40_000_000, percentageUsed: 100, isExceeded: true }), footage: 14.8, footageCap: 15, prompts: 142, weeklyPass: false, credit: none }
    case 'acct-cancelend':
      return { entitlement: { kind: 'monthly', tier: 'creator', isTrial: false, expiresAt: iso(6 * day) }, subscription: sub({ cancelAtPeriodEnd: true, currentPeriodEnd: iso(6 * day) }), tokenUsage: tokens({ usedTokens: 33_000_000, percentageUsed: 82.5 }), footage: 3.2, footageCap: 5, prompts: 21, weeklyPass: false, credit: none }
    case 'acct-failed':
      return { entitlement: null, subscription: sub({ status: 'past_due', currentPeriodEnd: iso(-1 * day), lastPaymentError: 'Your bank declined the mandate authorisation (code 51: insufficient funds). Please retry with another payment method.' }), tokenUsage: null, footage: 0, footageCap: 5, prompts: 0, weeklyPass: false, credit: none }
  }
}

const docs = [
  { slug: 'terms', title: 'Terms of Service', version: '1.2', effectiveDate: '2026-09-01' },
  { slug: 'privacy', title: 'Privacy Policy', version: '1.1', effectiveDate: null },
]

const markdown = `# Terms of Service

Welcome to **Edito**. By using the service you agree to these terms.

## 1. Your account

- Keep your sign-in details private.
- You are responsible for what you upload.

| Plan | Notes |
| --- | --- |
| Free | Limited |
| Pro | Full access |

> This is preview text, not a real legal document. See [the site](https://example.com).

<script>alert('never rendered as HTML')</script>
`

export function accountFixtureApi(s: AccountScenario): Partial<AccountApi> {
  const f = fixture(s)
  const blocked = async (): Promise<never> => {
    throw new Error('Preview only: no checkout, order, trial or cancel call is made from fixtures.')
  }
  return {
    entitlement: async () => f.entitlement,
    subscription: async (): Promise<SubscriptionUsage> => ({ subscription: f.subscription, footageHoursUsed: f.footage, footageHoursCap: f.footageCap, promptCountToday: f.prompts, promptSoftCapPerDay: 150 }),
    tokenUsage: async () => f.tokenUsage,
    freeCredit: async () => f.credit,
    weeklyPricing: async () => ({ currency: 'INR', baseAmount: 1271, gstAmount: 229, totalAmount: 1500, isIndianPricing: true, resolvedCountryCode: 'IN' }),
    weeklyStatus: async () =>
      f.weeklyPass
        ? { id: 'wp', status: 'active', currency: 'INR', totalAmount: 1500, startedAt: iso(-3 * day), expiresAt: iso(4 * day), lastPaymentError: null, createdAt: iso(-3 * day), isActive: true }
        : null,
    weeklySync: blocked,
    checkout: blocked,
    trial: blocked,
    weeklyOrder: blocked,
    cancel: blocked,
    legalList: async () => docs,
    legalDoc: async (slug: string) => ({ ...(docs.find((d) => d.slug === slug) ?? docs[0]!), markdown }),
    createTicket: async () => ({ id: 't1', reference: 'SUP-PREVIEW' }),
  }
}
