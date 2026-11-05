/**
 * "Opening the app starts a new chat" must happen once per page load: not on a later re-render, and not when a
 * sign-in happens mid-session. Module state, so a reload resets it.
 */
let done = false

/** True the first time it is asked in this page load (the caller then starts the fresh chat), false afterwards. */
export function takeFreshStart(): boolean {
  if (done) return false
  done = true
  return true
}

/** For screens that seed a chat on purpose (the dev preview): the seeded chat must survive the open. */
export function markFreshStartDone(): void {
  done = true
}

/** Tests only. */
export function resetFreshStart(): void {
  done = false
}
