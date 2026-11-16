import { ApiError, apiClient } from '@/lib/apiClient'
import { toSnapshot, type ChatJobWire } from './chatApi'
import type { ChatJobSnapshot } from './chatTypes'

/**
 * Background music of a finished edit (backend2 only): what plays now, three suggested tracks to try, the person's own
 * uploads and the volume range; and the change itself. A change is a new turn of the chat that only re-mixes the sound,
 * so the answer to it is an ordinary job snapshot the store polls like any other turn.
 */

export interface MusicTrack {
  id: string
  title: string
  artist: string
  mood: string | null
  durationSec: number | null
  /** Where the browser plays a short listen of the track. */
  previewUrl: string
  /** This is the track playing in the video now. */
  selected: boolean
}

export interface MusicCurrent {
  enabled: boolean
  /** `library` | `upload` when enabled. */
  kind: string | null
  id: string | null
  title: string | null
  artist: string | null
  /** The music's level in the mix (0 .. max); 0.1 by default. */
  volume: number
}

export interface MusicUpload {
  id: string
  name: string
  durationSec: number
}

export interface MusicState {
  /** The edit is finished, so the music may be changed now. */
  canChange: boolean
  current: MusicCurrent
  suggestions: MusicTrack[]
  uploads: MusicUpload[]
  volume: { value: number; min: number; max: number; default: number }
  limits: { maxBytes: number; maxSeconds: number }
}

/** What the person picked. `volume` alone (source `keep`) changes the level of the track that is playing. */
export type MusicChoice =
  | { source: 'library'; trackId: string; volume?: number }
  | { source: 'upload'; uploadId: string; volume?: number }
  | { source: 'none' }
  | { source: 'keep'; volume: number }

export interface MusicApi {
  /** `null` when this backend has no music card (the editor's own backend answers 404). */
  get(jobId: string, signal?: AbortSignal): Promise<MusicState | null>
  /** Starts the music change; resolves with the new turn's first snapshot. */
  set(jobId: string, choice: MusicChoice, signal?: AbortSignal): Promise<ChatJobSnapshot>
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** Wire -> state. Missing or malformed parts fall back to safe values; a track without a preview link is dropped. */
export function toMusicState(raw: any): MusicState {
  const cur = raw?.current ?? {}
  const vol = raw?.volume ?? {}
  const max = num(vol.max, 0.4)
  return {
    canChange: raw?.canChange === true,
    current: {
      enabled: cur.enabled === true,
      kind: str(cur.kind),
      id: str(cur.id),
      title: str(cur.title),
      artist: str(cur.artist),
      volume: num(cur.volume, num(vol.default, 0.1)),
    },
    suggestions: (Array.isArray(raw?.suggestions) ? raw.suggestions : [])
      .filter((s: any) => typeof s?.id === 'string' && typeof s?.previewUrl === 'string')
      .map((s: any): MusicTrack => ({
        id: s.id, title: str(s.title) ?? s.id, artist: str(s.artist) ?? '', mood: str(s.mood),
        durationSec: typeof s.durationSec === 'number' ? s.durationSec : null, previewUrl: s.previewUrl, selected: s.selected === true,
      })),
    uploads: (Array.isArray(raw?.uploads) ? raw.uploads : [])
      .filter((u: any) => typeof u?.id === 'string')
      .map((u: any): MusicUpload => ({ id: u.id, name: str(u.name) ?? u.id, durationSec: num(u.durationSec, 0) })),
    volume: { value: num(vol.value, num(cur.volume, 0.1)), min: num(vol.min, 0), max: max > 0 ? max : 0.4, default: num(vol.default, 0.1) },
    limits: { maxBytes: num(raw?.upload?.maxBytes, 80_000_000), maxSeconds: num(raw?.upload?.maxSeconds, 600) },
  }
}

/** The request body for a choice. */
export function toMusicBody(choice: MusicChoice): Record<string, unknown> {
  switch (choice.source) {
    case 'library':
      return { source: 'library', trackId: choice.trackId, ...(choice.volume !== undefined ? { volume: choice.volume } : {}) }
    case 'upload':
      return { source: 'upload', uploadId: choice.uploadId, ...(choice.volume !== undefined ? { volume: choice.volume } : {}) }
    case 'none':
      return { source: 'none' }
    case 'keep':
      return { source: 'keep', volume: choice.volume }
  }
}

const path = (jobId: string) => `/chat/jobs/${encodeURIComponent(jobId)}/music`

export const httpMusicApi: MusicApi = {
  async get(jobId, signal) {
    try {
      return toMusicState(await apiClient.get(path(jobId), { signal }))
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return null
      throw e
    }
  },
  async set(jobId, choice, signal) {
    return toSnapshot((await apiClient.post(path(jobId), toMusicBody(choice), { signal })) as ChatJobWire)
  },
}

let current: MusicApi | null = null
export const getMusicApi = (): MusicApi => (current ??= httpMusicApi)
export const setMusicApi = (api: MusicApi | null): void => {
  current = api
}

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i

export function looksLikeAudio(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)
}

/** Length of an audio file from its metadata (the upload route records it). Rejects when the browser cannot read it. */
export function probeAudio(file: File, timeoutMs = 15_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = new Audio()
    el.preload = 'metadata'
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      el.removeAttribute('src')
      el.load()
      URL.revokeObjectURL(url)
      fn()
    }
    const timer = setTimeout(() => finish(() => reject(new Error('Timed out reading the audio file'))), timeoutMs)
    el.onloadedmetadata = () => {
      const d = Number.isFinite(el.duration) ? el.duration : 0
      finish(() => resolve(d))
    }
    el.onerror = () => finish(() => reject(new Error('Could not read the audio file')))
    el.src = url
  })
}
