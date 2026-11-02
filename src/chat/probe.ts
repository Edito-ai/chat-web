export interface VideoProbe {
  duration: number
  width: number | null
  height: number | null
  /**
   * true / false only when the browser can tell. `null` means unknown: Chrome and Edge do not expose
   * `HTMLMediaElement.audioTracks` by default, so "no tracks listed" there proves nothing. Callers send
   * `true` for unknown and the server's ffprobe of the real file is the source of truth.
   */
  hasAudio: boolean | null
}

type MaybeAudioEl = HTMLVideoElement & { audioTracks?: { length: number }; mozHasAudio?: boolean }

/** Reads what the browser can know about a video from its metadata. Rejects when the file cannot be read. */
export function probeVideo(file: File, timeoutMs = 15_000): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement('video') as MaybeAudioEl
    el.preload = 'metadata'
    el.muted = true
    let settled = false
    const timer = setTimeout(() => finish(() => reject(new Error('Timed out reading the video'))), timeoutMs)
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      el.removeAttribute('src')
      el.load()
      URL.revokeObjectURL(url)
      fn()
    }
    el.onloadedmetadata = () => {
      // Read BEFORE finish(): it detaches the source, which resets duration and size.
      const info: VideoProbe = {
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        width: el.videoWidth || null,
        height: el.videoHeight || null,
        hasAudio: audioPresence(el),
      }
      finish(() => resolve(info))
    }
    el.onerror = () => finish(() => reject(new Error('Could not read the video')))
    el.src = url
  })
}

/** Positive or trustworthy-negative evidence only; otherwise unknown. */
export function audioPresence(el: { audioTracks?: { length: number }; mozHasAudio?: boolean }): boolean | null {
  if (typeof el.mozHasAudio === 'boolean') return el.mozHasAudio
  if (el.audioTracks && typeof el.audioTracks.length === 'number') return el.audioTracks.length > 0
  return null
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i

export function looksLikeVideo(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXT.test(file.name)
}
