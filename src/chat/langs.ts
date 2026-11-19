/** How many single-letter edits turn `a` into `b` (Levenshtein). */
export function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]!
}

export type LangCheck =
  | { kind: 'ok'; name: string }
  | { kind: 'suggest'; name: string; others: string[] }
  | { kind: 'unknown'; closest: string[] }
  | { kind: 'empty' }

/**
 * Checks a language the person typed against the ones the server knows: an exact match (any case) is fine; a near miss
 * ("Marathii", "tamill", "hindhi") gets "Did you mean ...?"; anything else gets the closest names to pick from.
 */
export function checkLanguage(typed: string, known: string[]): LangCheck {
  const q = typed.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!q) return { kind: 'empty' }
  const exact = known.find((n) => n.toLowerCase() === q)
  if (exact) return { kind: 'ok', name: exact }
  const ranked = known
    .map((name) => {
      const n = name.toLowerCase()
      const d = Math.min(editDistance(q, n), n.startsWith(q) && q.length >= 3 ? 1 : Infinity)
      return { name, d }
    })
    .sort((x, y) => x.d - y.d || x.name.localeCompare(y.name))
  const best = ranked[0]
  const allowed = Math.max(1, Math.floor(q.length / 3))
  if (best && best.d <= allowed) {
    return { kind: 'suggest', name: best.name, others: ranked.slice(1).filter((r) => r.d <= allowed).map((r) => r.name).slice(0, 2) }
  }
  return { kind: 'unknown', closest: ranked.slice(0, 3).map((r) => r.name) }
}
