import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccountApi } from '../accountApi'
import { useAccount } from '../accountStore'

beforeEach(() => {
  setAccountApi(null)
  useAccount.getState().reset()
})

describe('account store', () => {
  it('loads the entitlement', async () => {
    setAccountApi({ entitlement: async () => ({ kind: 'monthly', tier: 'creator', isTrial: true, expiresAt: null }) })
    await useAccount.getState().refresh()
    expect(useAccount.getState()).toMatchObject({ status: 'loaded', entitlement: { isTrial: true } })
  })

  it('a failed first load is an error with no plan invented', async () => {
    setAccountApi({ entitlement: vi.fn().mockRejectedValue(new Error('down')) })
    await useAccount.getState().refresh()
    expect(useAccount.getState()).toMatchObject({ status: 'error', entitlement: null })
  })

  it('a failed refresh keeps the plan already known', async () => {
    const ent = { kind: 'weekly' as const, tier: 'weekly', isTrial: false, expiresAt: null }
    setAccountApi({ entitlement: async () => ent })
    await useAccount.getState().refresh()
    setAccountApi({ entitlement: vi.fn().mockRejectedValue(new Error('down')) })
    await useAccount.getState().refresh()
    expect(useAccount.getState()).toMatchObject({ status: 'loaded', entitlement: ent })
  })

  it('opens and closes dialogs, remembering the plans focus', () => {
    useAccount.getState().openDialog('billing', { focus: 'plans' })
    expect(useAccount.getState()).toMatchObject({ dialog: 'billing', billingFocus: 'plans' })
    useAccount.getState().closeDialog()
    expect(useAccount.getState()).toMatchObject({ dialog: null, billingFocus: null })
  })
})
