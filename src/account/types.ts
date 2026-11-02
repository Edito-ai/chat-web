/** Wire shapes of the backend billing / support / legal routes (camelCase on the wire). */

export type BillingTier = 'creator' | 'studio'

export interface Entitlement {
  kind: 'weekly' | 'monthly'
  tier: string
  isTrial: boolean
  expiresAt: string | null
}

export interface SubscriptionInfo {
  id: string
  tier: string
  status: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  trialEnd: string | null
  cancelAtPeriodEnd: boolean
  lastPaymentError: string | null
  isTrial: boolean
}

export interface SubscriptionUsage {
  subscription: SubscriptionInfo | null
  footageHoursUsed: number
  footageHoursCap: number | null
  promptCountToday: number
  promptSoftCapPerDay: number | null
}

export interface TokenUsage {
  usedTokens: number
  limitTokens: number
  percentageUsed: number
  periodStart: string
  periodEnd: string
  isWeekly: boolean
  isExceeded: boolean
}

export interface FreeCreditStatus {
  enabled: boolean
  claimed: boolean
  tokens: number
  usd: number
  phoneMasked: string | null
}

export interface WeeklyPassPricing {
  currency: string
  baseAmount: number
  gstAmount: number
  totalAmount: number
  isIndianPricing: boolean
  resolvedCountryCode: string | null
}

export interface WeeklyPassOrder {
  orderId: string
  checkoutUrl: string
  pricing: WeeklyPassPricing
}

export type WeeklyPassStatus = 'pending' | 'active' | 'failed' | 'cancelled' | 'expired'

export interface WeeklyPass {
  id: string
  status: WeeklyPassStatus
  currency: string
  totalAmount: number
  startedAt: string | null
  expiresAt: string | null
  lastPaymentError: string | null
  createdAt: string
  isActive: boolean
}

export interface LegalDocumentSummary {
  slug: string
  title: string
  version: string
  effectiveDate: string | null
}

export interface LegalDocument extends LegalDocumentSummary {
  markdown: string
}

export const TICKET_CATEGORIES = ['bug', 'ai_quality', 'export', 'performance', 'billing', 'account', 'privacy_legal', 'feature_request', 'other'] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]
export const TICKET_SEVERITIES = ['low', 'normal', 'high', 'urgent'] as const
export type TicketSeverity = (typeof TICKET_SEVERITIES)[number]

export interface CreateTicketInput {
  category: TicketCategory
  severity: TicketSeverity
  subject: string
  message: string
}

export interface TicketReceipt {
  id: string
  reference: string
}
