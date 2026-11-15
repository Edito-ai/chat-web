const COLORS = ['#FF7A5C', '#FFC4AE', '#D8264A', '#FFD166', '#7BD389', '#8ECAE6', '#FFFFFF']

/** A repeatable 0..1 value for piece `i` and slot `k` (no random numbers: the same burst every time, and no server / client mismatch). */
const unit = (i: number, k: number) => {
  const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * A one-shot burst of paper confetti over the page (pure CSS, `confettiFall` in globals.css). It is hidden for people who asked
 * their system for less motion. Decorative only: it never takes a click.
 */
export function Confetti({ count = 44 }: { count?: number }) {
  return (
    <div aria-hidden data-testid="confetti" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const w = 6 + Math.round(unit(i, 1) * 6)
        return (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                left: `${Math.round(unit(i, 2) * 100)}%`,
                width: w,
                height: Math.round(w * (i % 3 === 0 ? 1 : 1.8)),
                background: COLORS[i % COLORS.length],
                borderRadius: i % 3 === 0 ? '50%' : 2,
                '--dx': `${Math.round((unit(i, 3) - 0.5) * 220)}px`,
                '--rot': `${Math.round((unit(i, 4) - 0.5) * 1080)}deg`,
                '--dur': `${(2.2 + unit(i, 5) * 1.8).toFixed(2)}s`,
                '--delay': `${(unit(i, 6) * 0.7).toFixed(2)}s`,
              } as React.CSSProperties
            }
          />
        )
      })}
    </div>
  )
}
