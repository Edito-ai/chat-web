import { apiClient } from '@/lib/apiClient'
import { toSnapshot, type ChatJobWire } from './chatApi'
import type { ChatJobSnapshot, ClipItem, ClipOptions, ClipsSource, ClipStyled } from './chatTypes'

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
      styled: toStyled(c.styled),
    })
  }
  return out
}

const STYLED_STATES = ['rendering', 'ready', 'failed'] as const

export function toStyled(raw: unknown): ClipStyled | null {
  const r = raw as Record<string, unknown> | null
  if (!r || typeof r !== 'object' || !(STYLED_STATES as readonly string[]).includes(r.state as string)) return null
  return {
    state: r.state as ClipStyled['state'], version: num(r.version) ?? 0, error: typeof r.error === 'string' ? r.error : null,
    captions: r.captions === true, noWords: r.noWords === true,
    videoUrl: typeof r.videoUrl === 'string' ? r.videoUrl : null, downloadUrl: typeof r.downloadUrl === 'string' ? r.downloadUrl : null,
    downloadFilename: str(r.downloadFilename) || 'clip (styled).mp4',
  }
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

// --- studio ------------------------------------------------------------------------------------------------------------

export interface CaptionTemplate {
  id: string
  name: string
  desc: string
  upper: boolean
  style: { color: string; accent: string; bg: string | null; glow?: string }
}

export interface StudioTrack {
  id: string
  title: string
  artist: string
  mood: string | null
  previewUrl: string
  selected: boolean
}

export interface StudioLook {
  captions: { on: boolean; template: string }
  music: { source: 'none' | 'library' | 'upload'; trackId?: string; uploadId?: string; volume: number }
  sfx: { on: boolean }
}

export interface StudioState {
  clip: ClipItem
  look: StudioLook
  templates: CaptionTemplate[]
  tracks: StudioTrack[]
  uploads: { id: string; name: string; durationSec: number }[]
  volume: { default: number; max: number }
  maxUploadBytes: number
  sourceTitle: string
  projectId: string
}

export const DEFAULT_LOOK: StudioLook = { captions: { on: false, template: 'bold' }, music: { source: 'none', volume: 0.12 }, sfx: { on: false } }

export function toLook(raw: any): StudioLook {
  const src = raw?.music?.source
  const source: StudioLook['music']['source'] = src === 'library' || src === 'upload' ? src : 'none'
  return {
    captions: { on: raw?.captions?.on === true, template: str(raw?.captions?.template) || 'bold' },
    music: {
      source, volume: num(raw?.music?.volume) ?? DEFAULT_LOOK.music.volume,
      ...(source === 'library' && typeof raw?.music?.trackId === 'string' ? { trackId: raw.music.trackId } : {}),
      ...(source === 'upload' && typeof raw?.music?.uploadId === 'string' ? { uploadId: raw.music.uploadId } : {}),
    },
    sfx: { on: raw?.sfx?.on === true },
  }
}

/** Wire studio -> typed. Returns null when the clip part is unusable. */
export function toStudio(raw: any): StudioState | null {
  const clip = toClips([raw?.clip])[0]
  if (!clip) return null
  const m = raw?.music ?? {}
  return {
    clip, look: toLook(raw?.look),
    templates: (Array.isArray(raw?.templates) ? raw.templates : [])
      .filter((t: any) => typeof t?.id === 'string' && typeof t?.name === 'string')
      .map((t: any): CaptionTemplate => ({
        id: t.id, name: t.name, desc: str(t.desc), upper: t.upper === true,
        style: { color: str(t.style?.color) || '#FFFFFF', accent: str(t.style?.accent) || '#FFFFFF', bg: typeof t.style?.bg === 'string' ? t.style.bg : null,
                 ...(typeof t.style?.glow === 'string' ? { glow: t.style.glow } : {}) },
      })),
    tracks: (Array.isArray(m.suggestions) ? m.suggestions : [])
      .filter((t: any) => typeof t?.id === 'string' && typeof t?.previewUrl === 'string')
      .map((t: any): StudioTrack => ({ id: t.id, title: str(t.title) || t.id, artist: str(t.artist), mood: typeof t.mood === 'string' ? t.mood : null,
                                       previewUrl: t.previewUrl, selected: t.selected === true })),
    uploads: (Array.isArray(m.uploads) ? m.uploads : [])
      .filter((u: any) => typeof u?.id === 'string')
      .map((u: any) => ({ id: u.id, name: str(u.name) || u.id, durationSec: num(u.durationSec) ?? 0 })),
    volume: { default: num(m.volume?.default) ?? 0.12, max: num(m.volume?.max) ?? 0.4 },
    maxUploadBytes: num(m.upload?.maxBytes) ?? 80_000_000,
    sourceTitle: str(raw?.sourceTitle), projectId: str(raw?.projectId),
  }
}

/** A change to a look: any part, any field of it (the server keeps the rest). */
export interface LookPatch {
  captions?: Partial<StudioLook['captions']>
  music?: Partial<StudioLook['music']>
  sfx?: Partial<StudioLook['sfx']>
}

/** Two looks ask for the same render. */
export function sameLook(a: StudioLook, b: StudioLook): boolean {
  const key = (l: StudioLook) =>
    JSON.stringify([l.captions.on, l.captions.on ? l.captions.template : '', l.music.source, l.music.trackId ?? '', l.music.uploadId ?? '',
                    l.music.source === 'none' ? 0 : Math.round(l.music.volume * 100), l.sfx.on])
  return key(a) === key(b)
}

export interface ClipsApi {
  /** New bounds and / or title for one clip; resolves with the job (its clips list carries the re-cut clip). */
  trim(jobId: string, clipId: string, patch: ClipPatch, signal?: AbortSignal): Promise<ChatJobSnapshot>
  /** What is said around a clip (30 s either side), to pick a new start or end. */
  lines(jobId: string, clipId: string, signal?: AbortSignal): Promise<{ lines: ClipLine[]; durationSec: number | null }>
  /** The clip studio: the clip, its look, the caption styles, three tracks, the person's own audio. */
  studio(jobId: string, clipId: string, signal?: AbortSignal): Promise<StudioState>
  /** Apply a look (missing parts keep what the clip has); the render runs on the server, follow it with `studio`. */
  setLook(jobId: string, clipId: string, look: LookPatch, signal?: AbortSignal): Promise<StudioState>
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
  async studio(jobId, clipId, signal) {
    const st = toStudio(await apiClient.get(`${clipPath(jobId, clipId)}/studio`, { signal }))
    if (!st) throw new Error('The clip could not be read.')
    return st
  },
  async setLook(jobId, clipId, look, signal) {
    const st = toStudio(await apiClient.post(`${clipPath(jobId, clipId)}/studio`, look, { signal }))
    if (!st) throw new Error('The clip could not be read.')
    return st
  },
}

let current: ClipsApi | null = null
export const getClipsApi = (): ClipsApi => (current ??= httpClipsApi)
export const setClipsApi = (api: ClipsApi | null): void => {
  current = api
}
