import clsx from 'clsx'

export type TileMode = 'still' | 'float' | 'pulse'

/**
 * The Broll mark on the brand gradient (indigo, crimson, peach), as a rounded tile. It is the identity: avatar at rest,
 * hero on the first screens, loader. `float` drifts gently, `pulse` breathes with a glow. Reduced motion stops both.
 */
export function BrandTile({ size = 40, mode = 'still', className }: { size?: number; mode?: TileMode; className?: string }) {
  return (
    <span
      aria-hidden
      data-tile={mode}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
      className={clsx(
        'relative block shrink-0 overflow-hidden ring-1 ring-white/20 shadow-[0_12px_32px_-14px_rgb(0_0_0/0.9)]',
        mode === 'float' && 'animate-orb-idle',
        mode === 'pulse' && 'animate-tile-pulse',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark-tile.webp" alt="" width={640} height={640} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
    </span>
  )
}
