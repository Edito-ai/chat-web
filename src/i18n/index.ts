import { useEffect } from 'react'
import { create } from 'zustand'
import { en, type MessageKey } from './en'
import { hi } from './hi'

export type { MessageKey }
export type Locale = 'en' | 'hi'

const KEY = 'edito.chat-web.locale'
const tables: Record<Locale, Record<MessageKey, string>> = { en, hi }

/** Browser-only: stored choice, else the browser language. Never call during server render. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'hi') return saved
  } catch {
    // storage blocked: fall through to the browser language
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en'
}

export const useLocale = create<{ locale: Locale; setLocale: (l: Locale) => void }>((set) => ({
  // Always 'en' at creation so server HTML and the first client render match; LocaleSync applies detectLocale().
  locale: 'en',
  setLocale: (locale) => {
    try {
      localStorage.setItem(KEY, locale)
    } catch {
      // not persisted; still applies for this session
    }
    set({ locale })
  },
}))

/** Looks up a key and fills `{name}` placeholders. */
export function translate(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const text = tables[locale][key] ?? en[key]
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text
}

export function useT() {
  const locale = useLocale((s) => s.locale)
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return { locale, t: (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params) }
}
