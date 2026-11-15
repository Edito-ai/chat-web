import { apiClient } from '@/lib/apiClient'

/**
 * Permanently deletes the signed-in account and everything it owns (`DELETE /account`). The account's own email is typed
 * again so a borrowed, still-open session cannot remove someone's account by one stray click (there is no password to ask:
 * people sign in with an email code or Google). Resolves on success (204); rejects with an `ApiError` whose status says why:
 * 400 not this account's email, 409 not allowed (an admin account), 429 too many tries.
 */
export async function deleteAccount(confirmEmail: string): Promise<void> {
  await apiClient.delete('/account', { body: { confirmEmail } })
}
