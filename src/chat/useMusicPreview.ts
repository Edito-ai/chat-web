'use client'

import { useEffect, useRef } from 'react'

/** Music sits under the voice in the final mix; the preview has no ducking, so it is kept a little lower than a 1:1 match. */
const LEVEL = 1.6

/**
 * Plays the chosen track along with the clip in the studio preview: it starts, pauses, seeks and changes speed with the
 * video, loops like the final mix, and follows the volume slider at once. `url` null = no music (or none to preview).
 */
export function useMusicPreview(video: HTMLVideoElement | null, url: string | null, volume: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.min(1, volume * LEVEL)
  }, [volume])

  useEffect(() => {
    if (!video || !url) return
    const a = new Audio()
    a.src = url
    a.loop = true
    a.preload = 'auto'
    a.volume = Math.min(1, volumeRef.current * LEVEL)
    audioRef.current = a
    const at = () => {
      const d = a.duration
      return Number.isFinite(d) && d > 0 ? video.currentTime % d : video.currentTime
    }
    const play = () => {
      a.currentTime = at()
      a.playbackRate = video.playbackRate
      void a.play().catch(() => undefined) // blocked autoplay: the next play of the video tries again
    }
    const pause = () => a.pause()
    const seek = () => {
      a.currentTime = at()
    }
    const rate = () => {
      a.playbackRate = video.playbackRate
    }
    const mute = () => {
      a.muted = video.muted
    }
    if (!video.paused) play()
    video.addEventListener('play', play)
    video.addEventListener('pause', pause)
    video.addEventListener('ended', pause)
    video.addEventListener('seeked', seek)
    video.addEventListener('ratechange', rate)
    video.addEventListener('volumechange', mute)
    return () => {
      video.removeEventListener('play', play)
      video.removeEventListener('pause', pause)
      video.removeEventListener('ended', pause)
      video.removeEventListener('seeked', seek)
      video.removeEventListener('ratechange', rate)
      video.removeEventListener('volumechange', mute)
      a.pause()
      a.src = ''
      if (audioRef.current === a) audioRef.current = null
    }
  }, [video, url])
}
