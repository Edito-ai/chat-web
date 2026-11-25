import { useEffect, useState } from 'react'

export const STUCK_AFTER_MS = 5 * 60_000

/**
 * True once `signature` has stayed the same for `afterMs` (default 5 minutes) while `active`.
 * A new signature (the job moved to another stage or its progress changed) starts the count again and hides the nudge.
 * `dismiss()` silences the nudge for the current signature only, so a later stall can ask again.
 */
export function useStuckNudge(active: boolean, signature: string, afterMs = STUCK_AFTER_MS) {
  const [stuckFor, setStuckFor] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => {
    setStuckFor(null)
    if (!active) return
    const id = window.setTimeout(() => setStuckFor(signature), afterMs)
    return () => window.clearTimeout(id)
  }, [active, signature, afterMs])

  return {
    show: active && stuckFor === signature && dismissed !== signature,
    dismiss: () => setDismissed(signature),
  }
}

/** What "the same state" means for a running turn: which job and turn, which stage, and progress to the nearest percent. */
export function progressSignature(m: { jobId: string; turn: number; stage: string | null; progress: number | null; status: string }): string {
  return [m.jobId, m.turn, m.status, m.stage ?? '', m.progress === null ? '' : Math.round(m.progress * 100)].join('|')
}
