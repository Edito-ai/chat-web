/** The output shape of the chat project, taken from the first video so a portrait source is not letterboxed. */
export interface ProjectShape {
  width: number
  height: number
  resLabel: '1080p'
  fps: 30
  aspect: '16:9' | '9:16' | '1:1'
}

/** Within 5% of square counts as square; anything unknown or non-finite falls back to landscape. */
export function shapeFor(width: number | null | undefined, height: number | null | undefined): ProjectShape {
  const ratio = width && height && width > 0 && height > 0 ? width / height : 16 / 9
  if (ratio < 0.95) return { width: 1080, height: 1920, resLabel: '1080p', fps: 30, aspect: '9:16' }
  if (ratio <= 1.05) return { width: 1080, height: 1080, resLabel: '1080p', fps: 30, aspect: '1:1' }
  return { width: 1920, height: 1080, resLabel: '1080p', fps: 30, aspect: '16:9' }
}
