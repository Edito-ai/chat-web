import * as billing from './services/billing'
import * as weekly from './services/weeklyPass'
import * as support from './services/supportApi'
import { deleteAccount } from './services/accountDelete'

/** Every network call the account UI makes, behind one seam so /dev/preview can swap in fixtures. */
export const realAccountApi = {
  entitlement: billing.fetchEntitlement,
  subscription: billing.fetchSubscription,
  tokenUsage: billing.fetchTokenUsage,
  freeCredit: billing.fetchFreeCredit,
  claimFreeCredit: billing.claimFreeCredit,
  checkout: billing.createCheckoutSession,
  trial: billing.startFreeTrial,
  cancel: billing.cancelSubscription,
  weeklyPricing: weekly.fetchWeeklyPassPricing,
  weeklyOrder: weekly.createWeeklyPassOrder,
  weeklyStatus: weekly.fetchWeeklyPass,
  weeklySync: weekly.syncWeeklyPassOrder,
  legalList: support.listLegalDocuments,
  legalDoc: support.getLegalDocument,
  createTicket: support.createTicket,
  deleteAccount,
}

export type AccountApi = typeof realAccountApi

let current: AccountApi = realAccountApi

export const accountApi = (): AccountApi => current

/** Preview/tests only. `null` restores the real backend client. */
export function setAccountApi(api: Partial<AccountApi> | null): void {
  current = api ? { ...realAccountApi, ...api } : realAccountApi
}
