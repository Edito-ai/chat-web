import clsx from 'clsx'

export type OrbMode = 'run' | 'still'

/**
 * The glass orb with two eyes: the assistant in the chat. `run` bounces with squash and stretch and a pulsing shadow while an
 * edit runs; `still` is the same orb at rest. Decorative only; reduced motion stops the animation (global rule).
 */
export function Orb({ mode = 'still', className }: { mode?: OrbMode; className?: string }) {
  return (
    <span aria-hidden data-orb={mode} className={clsx('relative block shrink-0', className)}>
      {mode === 'run' && <span className="absolute inset-x-[18%] bottom-0 h-[7%] animate-orb-shadow rounded-[50%] bg-black/70 blur-[6px]" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mascot/orb.webp"
        alt=""
        width={512}
        height={512}
        draggable={false}
        className={clsx('absolute bottom-[7%] left-[4%] block w-[92%] origin-bottom select-none', mode === 'run' && 'animate-orb-bounce')}
      />
    </span>
  )
}
