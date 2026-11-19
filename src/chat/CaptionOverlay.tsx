'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { activeAt, captionLines } from './captionTiming'
import type { CaptionTemplate, ClipCaptions } from './clips'

/** Where the picture really is inside the <video> box (object-contain leaves bars), in px relative to the box. */
interface Frame {
  left: number
  top: number
  width: number
  height: number
  /** Rendered picture height / real picture height: ASS shadows and outlines are in real pixels. */
  scale: number
}

function frameOf(v: HTMLVideoElement): Frame | null {
  const bw = v.clientWidth
  const bh = v.clientHeight
  const vw = v.videoWidth
  const vh = v.videoHeight
  if (!bw || !bh) return null
  if (!vw || !vh) return { left: 0, top: 0, width: bw, height: bh, scale: 1 }
  const k = Math.min(bw / vw, bh / vh)
  const width = vw * k
  const height = vh * k
  return { left: v.offsetLeft + (bw - width) / 2, top: v.offsetTop + (bh - height) / 2, width, height, scale: k }
}

/**
 * The live caption preview: the clip's words drawn over the playing video in the chosen style, timed like the server's
 * burn-in (lines, the word being said in the accent colour, emphasis, pop, 12% from the bottom, size as a share of the
 * picture height). Nothing is rendered: change the style and it changes at once. Apply makes the real file on the server.
 */
export function CaptionOverlay({ video, captions, template }: { video: HTMLVideoElement | null; captions: ClipCaptions; template: CaptionTemplate }) {
  const { words, plan } = captions
  const [frame, setFrame] = useState<Frame | null>(null)
  const [now, setNow] = useState<{ line: number; word: number } | null>(null)
  const lines = useMemo(() => captionLines(words, plan, video?.duration && Number.isFinite(video.duration) ? video.duration : Infinity), [words, plan, video])
  const emph = useMemo(() => new Set(plan.emphasis), [plan])

  // Follow the picture's size and place (the player resizes with the window; metadata gives the real picture size).
  useEffect(() => {
    if (!video) return
    const measure = () => setFrame(frameOf(video))
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(video)
    video.addEventListener('loadedmetadata', measure)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      video.removeEventListener('loadedmetadata', measure)
      window.removeEventListener('resize', measure)
    }
  }, [video])

  // Follow the playhead: every frame while playing, once on a seek or pause.
  useEffect(() => {
    if (!video) return
    let raf = 0
    const read = () => {
      const next = activeAt(lines, words, video.currentTime)
      setNow((prev) => (prev?.line === next?.line && prev?.word === next?.word ? prev : next))
    }
    const loop = () => {
      read()
      raf = requestAnimationFrame(loop)
    }
    const play = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      read()
    }
    read()
    if (!video.paused) play()
    video.addEventListener('play', play)
    video.addEventListener('pause', stop)
    video.addEventListener('seeked', stop)
    video.addEventListener('timeupdate', read)
    return () => {
      cancelAnimationFrame(raf)
      video.removeEventListener('play', play)
      video.removeEventListener('pause', stop)
      video.removeEventListener('seeked', stop)
      video.removeEventListener('timeupdate', read)
    }
  }, [video, lines, words])

  if (!frame || !now) return null
  const line = lines[now.line]!
  const fontPx = Math.max(10, template.size * frame.height)
  const outlinePx = Math.max(1, template.outlineW * frame.height)
  const shadowPx = template.shadow * frame.scale * 1.5
  const glow = template.style.glow
  const textShadow = [
    glow ? `0 0 ${outlinePx * 2}px ${glow}, 0 0 ${outlinePx * 4}px ${glow}` : null,
    shadowPx > 0 && !template.box ? `${shadowPx}px ${shadowPx}px 0 rgba(0,0,0,0.75)` : null,
  ].filter(Boolean).join(', ') || undefined

  const text: CSSProperties = {
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    fontWeight: template.bold ? 700 : 400,
    fontSize: fontPx,
    lineHeight: 1.18,
    color: template.style.color,
    textShadow,
    ...(template.box
      ? { background: template.boxColor, padding: `${outlinePx * 0.6}px ${outlinePx}px`, borderRadius: outlinePx * 0.4, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }
      : { WebkitTextStroke: `${outlinePx * 2}px ${template.outlineColor}`, paintOrder: 'stroke fill' }),
  }

  return (
    <div
      aria-hidden
      data-testid="studio-caption-overlay"
      className="pointer-events-none absolute flex items-end justify-center"
      style={{
        left: frame.left + frame.width * 0.06,
        width: frame.width * 0.88,
        top: frame.top,
        height: frame.height * 0.88, // 12% from the bottom, like the burn-in
      }}
    >
      <p key={now.line} className="caption-line-in text-center" style={{ maxWidth: '100%' }}>
        <span style={text}>
          {words.slice(line.a, line.b + 1).map((w, k) => {
            const i = line.a + k
            const current = i === now.word
            const lit = current || emph.has(i)
            const grow = current && (template.pop || emph.has(i))
            return (
              <span key={i}>
                <span
                  className="inline-block transition-transform duration-100 ease-out"
                  style={{ color: lit ? template.style.accent : undefined, transform: grow ? 'scale(1.12)' : undefined }}
                >
                  {template.upper ? w.t.toUpperCase() : w.t}
                </span>
                {k < line.b - line.a ? ' ' : ''}
              </span>
            )
          })}
        </span>
      </p>
    </div>
  )
}
