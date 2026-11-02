'use client'

import { useEffect } from 'react'
import { detectLocale, useLocale } from '@/i18n'

/** Applies the stored / browser language after hydration (server render and first paint are always English). */
export function LocaleSync() {
  useEffect(() => {
    useLocale.setState({ locale: detectLocale() })
  }, [])
  return null
}
