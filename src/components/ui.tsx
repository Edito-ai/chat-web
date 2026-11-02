'use client'

import clsx from 'clsx'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, ChevronRight, RefreshCw, type LucideIcon } from 'lucide-react'
import { friendlyError } from '@/lib/friendlyError'
import { useT } from '@/i18n'
const logoUrl = '/broll-logo.png'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  size?: 'sm' | 'md' | 'lg'
}

/** Icon-only button; callers must pass `aria-label`. Emphasis by elevation and ink weight, never hue. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, size = 'md', className, ...props }, ref) => {
    const dims = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-9 w-9'
    return (
      <button
        ref={ref}
        type="button"
        className={clsx(
          'inline-flex shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink-0 active:scale-95 disabled:pointer-events-none disabled:opacity-30',
          dims,
          className,
        )}
        {...props}
      >
        <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} strokeWidth={1.75} aria-hidden />
      </button>
    )
  },
)
IconButton.displayName = 'IconButton'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  icon?: LucideIcon
  children?: ReactNode
}

export function Button({ variant = 'secondary', icon: Icon, className, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-body font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40',
        variant === 'primary' && 'bg-ink-0 text-surface-0 hover:bg-white',
        variant === 'secondary' && 'border border-line bg-surface-3 text-ink-0 hover:bg-surface-4',
        variant === 'ghost' && 'text-ink-1 hover:bg-white/[0.06] hover:text-ink-0',
        className,
      )}
      {...props}
    >
      {Icon && <Icon size={15} strokeWidth={1.75} aria-hidden />}
      {children}
    </button>
  )
}

/** The Broll mark is white on transparency, so it is a CSS mask filled with currentColor. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2 text-ink-0">
      <span
        role="img"
        aria-label="Broll"
        className="inline-block shrink-0 bg-current"
        style={{
          width: size,
          height: size,
          maskImage: `url(${logoUrl})`,
          WebkitMaskImage: `url(${logoUrl})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
        }}
      />
      <span className="text-title font-semibold leading-none tracking-[-0.02em]">Broll</span>
    </div>
  )
}

/** A plain-language failure with an optional Retry and the technical reason behind "Details". */
export function InlineError({
  error,
  message,
  onRetry,
  className,
}: {
  error?: unknown
  message?: string
  onRetry?: () => void
  className?: string
}) {
  const { t } = useT()
  const f = error !== undefined ? friendlyError(error) : { message: message ?? friendlyError(null).message, details: undefined }
  return (
    <div role="alert" className={clsx('space-y-1 text-label text-danger', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5">
          <AlertCircle size={12} className="shrink-0" aria-hidden /> {f.message}
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium text-ink-1 underline-offset-2 hover:bg-white/[0.08] hover:text-ink-0"
          >
            <RefreshCw size={11} strokeWidth={2} aria-hidden /> {t('common.retry')}
          </button>
        )}
      </div>
      {f.details && (
        <details className="group text-ink-4">
          <summary className="flex cursor-pointer list-none items-center gap-0.5 text-ink-3 hover:text-ink-1 [&::-webkit-details-marker]:hidden">
            <ChevronRight size={11} className="transition-transform group-open:rotate-90" aria-hidden />
            {t('common.details')}
          </summary>
          <p className="mt-0.5 break-words">{f.details}</p>
        </details>
      )}
    </div>
  )
}
