export type Placement = 'top' | 'bottom' | 'left' | 'right'

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface Placed {
  top: number
  left: number
  side: Placement
}

const OPPOSITE: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

/**
 * Where the tour card goes next to `target`: the preferred side if the card fits there, else the opposite side, else the
 * remaining sides, else whichever side has the most room. The result is always kept `gutter` px inside the viewport.
 */
export function place(target: Box, card: { width: number; height: number }, viewport: { width: number; height: number }, preferred: Placement = 'bottom', gap = 16, gutter = 16): Placed {
  const room: Record<Placement, number> = {
    top: target.top - gap - gutter,
    bottom: viewport.height - (target.top + target.height) - gap - gutter,
    left: target.left - gap - gutter,
    right: viewport.width - (target.left + target.width) - gap - gutter,
  }
  const need = (s: Placement) => (s === 'top' || s === 'bottom' ? card.height : card.width)
  const order: Placement[] = [preferred, OPPOSITE[preferred], ...(['bottom', 'top', 'right', 'left'] as Placement[]).filter((s) => s !== preferred && s !== OPPOSITE[preferred])]
  const side = order.find((s) => room[s] >= need(s)) ?? order.reduce((a, b) => (room[b] > room[a] ? b : a))

  const cx = target.left + target.width / 2 - card.width / 2
  const cy = target.top + target.height / 2 - card.height / 2
  let top = cy
  let left = cx
  if (side === 'top') top = target.top - gap - card.height
  if (side === 'bottom') top = target.top + target.height + gap
  if (side === 'left') left = target.left - gap - card.width
  if (side === 'right') left = target.left + target.width + gap

  const clamp = (v: number, size: number, max: number) => Math.min(Math.max(v, gutter), Math.max(gutter, max - size - gutter))
  return { top: clamp(top, card.height, viewport.height), left: clamp(left, card.width, viewport.width), side }
}
