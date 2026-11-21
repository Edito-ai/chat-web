/**
 * The live preview (backend2 renderer/player): the edit plays on this device from its plan, so no preview video is rendered.
 * A weak or data-saving phone is not made to download and draw it on its own: it is offered with a tap instead, and a device
 * that turns out too slow while playing falls back to the still frames (always shown below the player).
 */

/** Below this much RAM (Chrome's navigator.deviceMemory, in GB) the preview is offered with a tap, not loaded by itself. */
export const MIN_MEMORY_GB = 4

/** What the player page reports (window.postMessage from the iframe). */
export type PlayerEvent =
  | { type: 'loading'; progress: number }
  | { type: 'ready'; bytes: number }
  | { type: 'perf'; fps: number; target: number; stalls: number }
  | { type: 'error'; message: string }

interface NavigatorLike {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

/** 'auto': load it right away. 'ask': show a button (low memory, or the person asked to save data). */
export function startMode(nav: NavigatorLike | undefined): 'auto' | 'ask' {
  if (!nav) return 'auto'
  if (nav.connection?.saveData) return 'ask'
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory < MIN_MEMORY_GB) return 'ask'
  return 'auto' // Safari / Firefox do not say how much memory there is: try, the frame-rate check below catches a slow phone
}

/** Could not keep up: well under the video's frame rate, or it kept stopping to wait. */
export function isSlow(perf: { fps: number; target: number; stalls: number }): boolean {
  const target = perf.target > 0 ? perf.target : 30
  return perf.fps < Math.max(15, target * 0.6) || perf.stalls >= 3
}

/** A message from the player page, or null for anything else that arrives on window.message. */
export function readPlayerEvent(data: unknown): PlayerEvent | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.source !== 'b2-player') return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  switch (d.type) {
    case 'loading':
      return { type: 'loading', progress: Math.max(0, Math.min(1, num(d.progress))) }
    case 'ready':
      return { type: 'ready', bytes: num(d.bytes) }
    case 'perf':
      return { type: 'perf', fps: num(d.fps), target: num(d.target), stalls: num(d.stalls) }
    case 'error':
      return { type: 'error', message: typeof d.message === 'string' ? d.message.slice(0, 200) : 'error' }
    default:
      return null
  }
}

/** "12 MB" for the button that asks before downloading. */
export function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`
}
