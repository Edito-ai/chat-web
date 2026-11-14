import { apiClient } from '@/lib/apiClient'
import { toSnapshot, type ChatJobWire } from './chatApi'
import type { ChatJobSnapshot, ClipItem, ClipOptions, ClipsSource } from './chatTypes'

/**
 * Stream clipping (backend2): a long stream in (an upload or a YouTube / Twitch link), its best short clips out. The run is
 * an ordinary chat job of kind `clips`; this file holds the wire mapping of its clips and the two calls a clip card makes.
 */

/** A video at least this long is treated as a stream: the composer switches to clipping by itself. */
export const LONG_STREAM_SEC = 20 * 60

export const DEFAULT_CLIP_OPTIONS: ClipOptions = { count: 12, minSec: 20, maxSec: 75 }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const STATES = ['ready', 'cutting', 'failed', 'pending'] as const

/** Wire clips -> typed ones; a malformed entry is dropped, never an error. */
export function toClips(raw: unknown): ClipItem[] {
  if (!Array.isArray(raw)) return []
  const out: ClipItem[] = []
  for (const c of raw) {
    const start = num(c?.start)
    const end = num(c?.end)
    if (typeof c?.id !== 'string' || start === null || end === null || end <= start) continue
    const state = (STATES as readonly string[]).includes(c.state) ? (c.state as ClipItem['state']) : 'failed'
    out.push({
      id: c.id, start, end, durationSec: num(c.durationSec) ?? Math.round((end - start) * 10) / 10,
      title: str(c.title) || c.id, reason: str(c.reason), score: num(c.score), text: str(c.text), state,
      error: typeof c.error === 'string' ? c.error : null, version: num(c.version) ?? 0,
      videoUrl: typeof c.videoUrl === 'string' ? c.videoUrl : null, thumbUrl: typeof c.thumbUrl === 'string' ? c.thumbUrl : null,
      downloadUrl: typeof c.downloadUrl === 'string' ? c.downloadUrl : null,
      downloadFilename: str(c.downloadFilename) || `${c.id}.mp4`,
    })
  }
  return out
}

export function toClipsSource(raw: unknown): ClipsSource | null {
  const r = raw as { kind?: unknown; title?: unknown; durationSec?: unknown } | null
  if (!r || (r.kind !== 'upload' && r.kind !== 'link')) return null
  return { kind: r.kind, title: str(r.title), durationSec: num(r.durationSec) }
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function clock(sec: number): string {
  const t = Math.max(0, Math.floor(sec))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i

/** The first link in a message, and the words around it (the clipping focus). */
export function splitLink(text: string): { url: string | null; rest: string } {
  const m = URL_RE.exec(text)
  if (!m) return { url: null, rest: text.trim() }
  const url = m[0].replace(/[.,;:!?)\]}]+$/, '')
  return { url, rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() }
}

/** The options made safe on this side too (the server clamps them again). */
export function clampOptions(o: Partial<ClipOptions>): ClipOptions {
  const n = (v: unknown, d: number, lo: number, hi: number) => {
    const x = typeof v === 'number' && Number.isFinite(v) ? v : d
    return Math.min(hi, Math.max(lo, Math.round(x)))
  }
  const maxSec = n(o.maxSec, DEFAULT_CLIP_OPTIONS.maxSec, 15, 180)
  const minSec = Math.min(n(o.minSec, DEFAULT_CLIP_OPTIONS.minSec, 10, 120), maxSec - 5)
  return { count: n(o.count, DEFAULT_CLIP_OPTIONS.count, 3, 20), minSec, maxSec }
}

export interface ClipLine {
  s: number
  e: number
  text: string
}

export interface ClipPatch {
  start?: number
  end?: number
  title?: string
}

export interface ClipsApi {
  /** New bounds and / or title for one clip; resolves with the job (its clips list carries the re-cut clip). */
  trim(jobId: string, clipId: string, patch: ClipPatch, signal?: AbortSignal): Promise<ChatJobSnapshot>
  /** What is said around a clip (30 s either side), to pick a new start or end. */
  lines(jobId: string, clipId: string, signal?: AbortSignal): Promise<{ lines: ClipLine[]; durationSec: number | null }>
}

const clipPath = (jobId: string, clipId: string) => `/chat/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clipId)}`

export const httpClipsApi: ClipsApi = {
  async trim(jobId, clipId, patch, signal) {
    return toSnapshot((await apiClient.patch(clipPath(jobId, clipId), patch, { signal })) as ChatJobWire)
  },
  async lines(jobId, clipId, signal) {
    const raw = (await apiClient.get(`${clipPath(jobId, clipId)}/lines`, { signal })) as { lines?: unknown; durationSec?: unknown }
    const lines = (Array.isArray(raw?.lines) ? raw.lines : [])
      .filter((l: any) => typeof l?.s === 'number' && typeof l?.e === 'number' && typeof l?.text === 'string')
      .map((l: any): ClipLine => ({ s: l.s, e: l.e, text: l.text }))
    return { lines, durationSec: num(raw?.durationSec) }
  },
}

let current: ClipsApi | null = null
export const getClipsApi = (): ClipsApi => (current ??= httpClipsApi)
export const setClipsApi = (api: ClipsApi | null): void => {
  current = api
}
