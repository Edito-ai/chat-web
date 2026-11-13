import { apiClient } from '@/lib/apiClient'

/**
 * Permanently deletes the signed-in account and everything it owns (`DELETE /account`, both backends). The password is
 * asked again so a borrowed, still-open session cannot remove someone's account. Resolves on success (204); rejects with
 * an `ApiError` whose status says why: 400 wrong password, 409 not allowed (an admin account), 429 too many tries.
 */
export async function deleteAccount(password: string): Promise<void> {
  await apiClient.delete('/account', { body: { password } })
}
