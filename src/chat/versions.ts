import type { ChatJobResult } from './chatTypes'

/**
 * Every turn of a chat keeps its own video: the backend serves it at `/files/<chat>/v/<turn>.mp4` (and `/v/<turn>/download`).
 * Given the newest turn's result, this is the same address for another turn. `null` when the newest result is not on that
 * kind of address (an older backend serves only the newest video, so an earlier turn has none).
 */
export function turnResult(latest: ChatJobResult, latestTurn: number, turn: number): ChatJobResult | null {
  if (turn === latestTurn) return latest
  const video = `/v/${latestTurn}.mp4`
  if (!latest.videoUrl.includes(video)) return null
  const swap = (url: string | null, from: string, to: string) => (url && url.includes(from) ? url.replace(from, to) : null)
  return {
    videoUrl: latest.videoUrl.replace(video, `/v/${turn}.mp4`),
    downloadUrl: swap(latest.downloadUrl, `/v/${latestTurn}/download`, `/v/${turn}/download`),
    fileName: null,
  }
}
