/**
 * What an error says on screen.
 *
 * - PRODUCTION: a plain sentence a person can act on. Never a status code, a path, a class name, SQL or a stack. A server error
 *   carries a short `reference` the person can quote to support.
 * - DEVELOPMENT (`NODE_ENV !== 'production'`, so also under vitest): the same sentence when the server already wrote one for people,
 *   but where production would HIDE the cause (a 500, a network failure, a raw exception text) the developer gets it:
 *   `[POST /chat/jobs -> 500] RuntimeError: ...`, with the server's `debug` object under "Details".
 *
 * The server's own sentences (`400 That is not the email of this account.`) pass through, minus the status prefix.
 */

export interface FriendlyError {
  /** Plain-language sentence: what happened + what to do. In development a technical line where production would hide the cause. */
  message: string
  /** Development only: the technical text and the sentence a user would see in production. Never shown in production. */
  details?: string
  /** The server's request id for a server error (a person can quote it to support). Shown in production, too. */
  reference?: string
}

/** The fields an error from `apiClient` / `authFetch` may carry (duck-typed: apiClient imports the auth store, which uses this file). */
interface Carrier {
  status?: number
  reason?: string
  path?: string
  method?: string
  reference?: string
  debug?: unknown
  details?: unknown
  code?: string
}

const NETWORK = /failed to fetch|networkerror|network request failed|load failed|can.t reach the server|err_connection|err_internet|econn/i
const STATUS_IN_TEXT = /request failed \((\d{3})\)/i
const STATUS_PREFIX = /^\d{3}\s+/
const GENERIC_AUTH = /^(unauthori[sz]ed|sign in first\.?|not authenticated|invalid token|token expired)$/i

export const COPY = {
  generic: 'Something went wrong. Please try again.',
  network: "Couldn't reach the server. Check your connection and try again.",
  server: 'Something went wrong on our side. Please try again in a moment.',
  busy: "We're having trouble right now. Please try again in a moment.",
  session: 'Your session has expired. Please sign in again.',
  forbidden: "You don't have access to this.",
  notFound: "We couldn't find that.",
  conflict: 'That already exists.',
  gone: 'That is no longer available.',
  tooLarge: 'That file is too large.',
  tooMany: 'Too many requests. Wait a moment, then try again.',
  check: "That didn't work. Please check what you entered and try again.",
  timeout: 'This is taking longer than expected. Please try again.',
} as const

/** Development shows technical detail; production never does. Read at call time so tests can switch it. */
export function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/** Signs that a text is for developers: paths, stack frames, class names, SQL, raw JSON, urls, "undefined". */
const TECHNICAL =
  /traceback|\bat \S+ \(|node_modules|\.(tsx?|jsx?|py)\b|\bline \d+|errno|winerror|\bsql\b|sqlalchemy|asyncpg|violates|duplicate key|constraint|relation "|botocore|nosuchkey|accessdenied|ffmpeg|ffprobe|x264|malloc|stderr|subprocess|returncode|exit(ed)? (status|code)|https?:\/\/|<\/?[a-z]+[^>]*>|\bundefined\b|\bnull\b|\bnan\b|nonetype|typeerror|referenceerror|syntaxerror|keyerror|attributeerror|valueerror|runtimeerror|unexpected token|unexpected end|is not a function|cannot read propert|error code:|\bexception\b|internal server error|generic error|json.*(parse|decode|expecting)|\btokens?\b.*\b(claims?|payload|signature)\b|\bjwt\b|\bclaims?\b|\bpayload\b|\bschema\b|\bendpoint\b|\bmiddleware\b|\bstack\b/i

/** True when `text` reads like something a person can be shown: one short sentence with no developer vocabulary. */
export function isHumanText(text: string | undefined | null): text is string {
  const t = (text ?? '').trim()
  if (!t || t.length > 220 || /\n/.test(t)) return false
  if (/^[{[]/.test(t)) return false
  return !TECHNICAL.test(t)
}

function asCarrier(e: unknown): Carrier {
  return e && typeof e === 'object' ? (e as Carrier) : {}
}

function rawText(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'string' ? e : ''
}

/** HTTP status from an `ApiError` / `AuthApiError` or from the message text (0 when there is none). */
function statusOf(e: unknown, raw: string): number {
  const s = asCarrier(e).status
  return typeof s === 'number' ? s : Number(STATUS_IN_TEXT.exec(raw)?.[1]) || 0
}

/** The server's own words, without the `400 ` prefix and without the ` - field: reason` suffix of a flattened 422. */
function serverText(e: unknown, raw: string): string {
  const r = asCarrier(e).reason
  if (typeof r === 'string' && r.trim()) return r.trim()
  return raw.replace(STATUS_PREFIX, '').replace(/\s+-\s+\S+: .*$/s, '').trim()
}

/** True when the failure is the server being unreachable or erroring - as opposed to "you are not signed in". */
export function isServerTrouble(e: unknown): boolean {
  const raw = rawText(e)
  return e instanceof TypeError || NETWORK.test(raw) || statusOf(e, raw) >= 500
}

/** The fields a 422 names, as words a person recognises (`phone`, `content_types` -> "Phone", "Content types"). */
function fieldNames(details: unknown): string[] {
  if (!Array.isArray(details)) return []
  const out: string[] = []
  for (const d of details) {
    const loc = (d as { loc?: unknown[] } | null)?.loc
    const last = Array.isArray(loc) ? String(loc[loc.length - 1] ?? '') : ''
    if (!last || /^\d+$/.test(last) || last === 'body') continue
    const words = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()
    const name = words.charAt(0).toUpperCase() + words.slice(1)
    if (!out.includes(name)) out.push(name)
  }
  return out.slice(0, 4)
}

/** What production would show for this status (the sentence a person can act on). */
function sentenceFor(e: unknown, status: number, text: string): string {
  const human = isHumanText(text) && !GENERIC_AUTH.test(text)
  if (status >= 500) return status === 502 || status === 503 || status === 504 ? COPY.busy : COPY.server
  if (status === 401) return human ? text : COPY.session
  if (status === 403) return human ? text : COPY.forbidden
  if (status === 404) return human ? text : COPY.notFound
  if (status === 409) return human ? text : COPY.conflict
  if (status === 410) return human ? text : COPY.gone
  if (status === 413) return COPY.tooLarge
  if (status === 429) return COPY.tooMany
  if (status === 408) return COPY.timeout
  if (status === 422) {
    const fields = fieldNames(asCarrier(e).details)
    return fields.length ? `Please check: ${fields.join(', ')}.` : human ? text : COPY.check
  }
  if (status >= 400) return human ? text : COPY.check
  return human ? text : COPY.generic
}

/** One developer line: `[POST /chat/jobs -> 500] RuntimeError: text`. */
function technicalLine(e: unknown, status: number, raw: string): string {
  const c = asCarrier(e)
  const where = [c.method, c.path].filter(Boolean).join(' ')
  const head = where || status ? `[${[where, status ? `-> ${status}` : ''].filter(Boolean).join(' ')}] ` : ''
  const dbg = c.debug as { type?: string; message?: string } | undefined
  const body = dbg?.type ? `${dbg.type}: ${dbg.message ?? ''}`.trim() : serverText(e, raw) || (e instanceof Error ? e.name : String(e))
  return `${head}${body}`.trim()
}

/**
 * Turns a thrown value into copy for the screen (see the file note for production vs development).
 * `fallback` is the sentence when nothing better is known.
 */
export function friendlyError(e: unknown, fallback: string = COPY.generic): FriendlyError {
  const raw = rawText(e)
  const c = asCarrier(e)
  const dev = isDevMode()
  const reference = typeof c.reference === 'string' && c.reference ? c.reference : undefined

  if (e instanceof DOMException && e.name === 'AbortError') return { message: fallback }

  const network = e instanceof TypeError || NETWORK.test(raw)
  const status = network ? 0 : statusOf(e, raw)
  const text = network ? '' : serverText(e, raw)
  const plain = raw.replace(STATUS_PREFIX, '').trim()
  const prod = network ? COPY.network : status ? sentenceFor(e, status, text) : isHumanText(plain) ? plain : fallback

  // A person is shown `prod`. A developer is shown the cause wherever `prod` would have hidden it.
  const hidesCause = network || status >= 500 || (!status && !isHumanText(plain)) || (status >= 400 && !isHumanText(text))
  if (dev && hidesCause) {
    const line = technicalLine(e, status, raw)
    const dbg = c.debug ? `\n${JSON.stringify(c.debug)}` : ''
    return { message: line, details: `${line}${dbg}\nA user sees in production: "${prod}"`, reference }
  }
  return { message: prod, reference }
}

/** The text for a place that keeps a plain string (a store's `error`, a dialog's `problem`). */
export function userMessage(e: unknown, fallback: string = COPY.generic): string {
  const f = friendlyError(e, fallback)
  // A string has no room for a second line, so the reference of a server error rides along: "... (Ref: 3fa9c1)".
  return f.reference ? `${f.message} (Ref: ${f.reference.slice(0, 12)})` : f.message
}
