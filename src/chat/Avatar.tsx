import clsx from 'clsx'
import { TID } from './testIds'

/** The assistant's round face: friendly blue, two eyes. The eyes blink slowly while `working` (CSS only, so the
 *  global reduced-motion rule stills it). Decorative: the message carries a screen-reader label instead. */
export function Avatar({ working = false, size = 28 }: { working?: boolean; size?: number }) {
  const eye = clsx('origin-center [transform-box:fill-box]', working && 'animate-blink')
  return (
    <svg
      data-testid={TID.avatar}
      data-working={working ? 'true' : 'false'}
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className="mt-0.5 shrink-0"
    >
      <defs>
        <radialGradient id="avatar-face" cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#7FB0FF" />
          <stop offset="1" stopColor="#3F6FE0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#avatar-face)" stroke="rgb(255 255 255 / 0.18)" />
      <ellipse className={eye} cx="11.5" cy="13.5" rx="2" ry="2.6" fill="#0B1020" />
      <ellipse className={eye} cx="20.5" cy="13.5" rx="2" ry="2.6" fill="#0B1020" />
      <circle cx="12.2" cy="12.6" r="0.7" fill="#fff" />
      <circle cx="21.2" cy="12.6" r="0.7" fill="#fff" />
      <path d="M11 20.2c1.4 1.7 3 2.5 5 2.5s3.6-.8 5-2.5" fill="none" stroke="#0B1020" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
