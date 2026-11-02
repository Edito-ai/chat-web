import { apiClient } from '@/lib/apiClient'
import type { VideoProbe } from './probe'
import type { ProjectShape } from './projectShape'

/**
 * The chat's upload path to the backend, trimmed from the editor's: create a project, upload each video into it
 * (one request for small files, chunked straight-to-R2 for big ones), and the asset id that comes back IS the
 * `videoId` for POST /chat/jobs. No thumbnails, peaks or checksums: the chat never shows a library.
 */

/** Below this a single multipart POST beats chunked upload's extra round trips. */
const CHUNKED_UPLOAD_THRESHOLD = 8 * 1024 * 1024
/** Matches the backend's default chunk size and clears R2's 5 MB floor for non-final parts. */
const CHUNK_SIZE = 8 * 1024 * 1024
const MAX_ATTEMPTS = 3
const RETRY_BASE_MS = 1000

export async function createChatProject(shape: ProjectShape): Promise<string> {
  const project = await apiClient.post('/projects', {
    name: `Chat edit ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    location: 'Chat',
    width: shape.width,
    height: shape.height,
    resLabel: shape.resLabel,
    fps: shape.fps,
    aspect: shape.aspect,
    contentType: 'talking_head',
  })
  return project.id as string
}

/** Best effort: removes an uploaded asset the user took out of the message. */
export async function deleteAsset(assetId: string): Promise<void> {
  await apiClient.delete(`/media/${encodeURIComponent(assetId)}`).catch(() => undefined)
}

export interface UploadOptions {
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

interface UploadSession {
  uploadId: string
  chunkSize: number
  totalChunks: number
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Uploads one video into the project and returns the backend asset id. Retries; a chunked retry resumes. */
export async function uploadVideo(projectId: string, file: File, probe: VideoProbe, opts: UploadOptions = {}): Promise<string> {
  let session: UploadSession | undefined
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return file.size > CHUNKED_UPLOAD_THRESHOLD
        ? await uploadChunked(projectId, file, probe, opts, session, (s) => (session = s))
        : await uploadSingle(projectId, file, probe, opts)
    } catch (e) {
      lastError = e
      if (opts.signal?.aborted) break
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1))
    }
  }
  // Retries exhausted (or cancelled): release the R2 session so it does not sit billing until the 24h sweep.
  if (session) void apiClient.delete(`/uploads/${session.uploadId}`).catch(() => undefined)
  throw lastError
}

/** Fields shared by both upload routes. `hasAudio` unknown is sent as true; the server ffprobes the real file. */
function metaFields(file: File, probe: VideoProbe) {
  return {
    name: file.name,
    kind: 'video' as const,
    duration: probe.duration,
    width: probe.width ?? undefined,
    height: probe.height ?? undefined,
    hasAudio: probe.hasAudio ?? true,
  }
}

async function uploadSingle(projectId: string, file: File, probe: VideoProbe, opts: UploadOptions): Promise<string> {
  const m = metaFields(file, probe)
  const form = new FormData()
  form.set('name', m.name)
  form.set('kind', m.kind)
  form.set('duration', String(m.duration))
  if (m.width !== undefined) form.set('width', String(m.width))
  if (m.height !== undefined) form.set('height', String(m.height))
  form.set('hasAudio', String(m.hasAudio))
  form.set('file', file, file.name)
  const body = await apiClient.upload(`/projects/${encodeURIComponent(projectId)}/media`, form, { signal: opts.signal })
  opts.onProgress?.(1)
  return body.id as string
}

async function putPart(url: string, partNumber: number, body: Blob, signal?: AbortSignal) {
  const res = await fetch(url, { method: 'PUT', body, signal })
  if (!res.ok) throw new Error(`Chunk ${partNumber} failed: ${res.status} ${res.statusText}`)
  const etag = res.headers.get('ETag') ?? res.headers.get('etag')
  if (!etag) {
    throw new Error('R2 did not expose an ETag for this chunk. The bucket CORS policy needs ExposeHeaders: ["ETag"] for this origin.')
  }
  return { partNumber, etag: etag.replaceAll('"', '') }
}

async function uploadChunked(
  projectId: string,
  file: File,
  probe: VideoProbe,
  opts: UploadOptions,
  resume: UploadSession | undefined,
  onSession: (s: UploadSession) => void,
): Promise<string> {
  const { signal, onProgress } = opts
  const session: UploadSession =
    resume ??
    (await apiClient
      .post(
        `/projects/${encodeURIComponent(projectId)}/uploads`,
        {
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          totalSize: file.size,
          ...metaFields(file, probe),
          chunkSize: CHUNK_SIZE,
        },
        { signal },
      )
      .then((init: UploadSession) => ({ uploadId: init.uploadId, chunkSize: init.chunkSize, totalChunks: init.totalChunks })))
  onSession(session)
  const { uploadId, totalChunks, chunkSize } = session

  // The parts at R2 are the state: ask which exist rather than trusting anything remembered here.
  const status = resume ? await apiClient.get(`/uploads/${uploadId}`, { signal }) : null
  const already = new Set<number>(status?.received ?? [])
  const parts: { partNumber: number; etag: string }[] = []
  let uploaded = already.size * chunkSize

  for (let index = 0; index < totalChunks; index++) {
    if (already.has(index)) continue
    const issued = await apiClient.get(`/uploads/${uploadId}/parts/${index}/url`, { signal })
    parts.push(await putPart(issued.url, issued.partNumber, file.slice(index * chunkSize, (index + 1) * chunkSize), signal))
    uploaded += Math.min(chunkSize, file.size - index * chunkSize)
    onProgress?.(Math.min(1, uploaded / file.size))
  }
  // Completion needs every part's ETag; the status route only lists which exist, so a resumed upload re-PUTs
  // the ones already received (same part number just overwrites) to read the ETag back.
  for (const index of already) {
    const issued = await apiClient.get(`/uploads/${uploadId}/parts/${index}/url`, { signal })
    parts.push(await putPart(issued.url, issued.partNumber, file.slice(index * chunkSize, (index + 1) * chunkSize), signal))
  }
  parts.sort((a, b) => a.partNumber - b.partNumber)
  const created = await apiClient.post(`/uploads/${uploadId}/complete`, { parts }, { signal })
  return created.id as string
}
