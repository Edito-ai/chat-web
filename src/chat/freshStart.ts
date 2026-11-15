/**
 * "Opening the app starts a new chat" must happen once per page load: not on a later re-render, and not when a
 * sign-in happens mid-session. Module state, so a reload resets it.
 */
let done = false

/** A reload of the same tab keeps the chat that was open (the store restores it). Only a fresh open starts a new one. */
function isReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return nav?.type === 'reload'
  } catch {
    return false
  }
}

/** True the first time it is asked in this page load (the caller then starts the fresh chat), false afterwards or on a reload. */
export function takeFreshStart(): boolean {
  if (done) return false
  done = true
  return !isReload()
}

/** For screens that seed a chat on purpose (the dev preview): the seeded chat must survive the open. */
export function markFreshStartDone(): void {
  done = true
}

/** Tests only. */
export function resetFreshStart(): void {
  done = false
}
