'use client'

import { useEffect, useRef, useState } from 'react'
import { Film } from 'lucide-react'

/** Five portrait cards in a fan: tilted on an arc, outer ones lower. Hover straightens and lifts one. */
const TILT = [-13, -6.5, 0, 6.5, 13]
const DROP = [30, 10, 0, 10, 30]

function FanCard({ i, src }: { i: number; src: string | null }) {
  const [hover, setHover] = useState(false)
  const [failed, setFailed] = useState(false)
  const video = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const v = video.current
    if (v && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) v.pause()
  }, [src])
  const showVideo = !!src && !failed
  return (
    <div
      className="animate-rise relative first:ml-0 -ml-[clamp(10px,2vw,22px)]"
      style={{ animationDelay: `${i * 70}ms`, zIndex: hover ? 10 : 5 - Math.abs(i - 2) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="relative aspect-[9/16] w-[clamp(84px,min(14vw,15vh),148px)] overflow-hidden rounded-2xl border border-white/10 bg-surface-1 shadow-[0_24px_50px_-18px_rgb(0_0_0/1)] transition-[transform,border-color] duration-300 ease-out"
        style={{
          transform: hover ? `translateY(${DROP[i]! - 16}px) rotate(0deg) scale(1.07)` : `translateY(${DROP[i]}px) rotate(${TILT[i]}deg)`,
          borderColor: hover ? 'rgb(255 255 255 / 0.3)' : undefined,
        }}
      >
        {showVideo ? (
          <video
            ref={video}
            src={src!}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_50%_0%,rgb(255_255_255/0.06),transparent_60%)]">
            <Film size={18} className="text-white/25" aria-hidden />
          </div>
        )}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
      </div>
    </div>
  )
}

export function ShowcaseFan({ sources }: { sources: readonly string[] }) {
  return (
    <div aria-hidden className="mx-auto mb-2 hidden w-full max-w-3xl items-start justify-center pb-12 [@media(min-height:740px)]:flex">
      {TILT.map((_, i) => (
        <FanCard key={i} i={i} src={sources.length > 0 ? sources[i % sources.length]! : null} />
      ))}
    </div>
  )
}
