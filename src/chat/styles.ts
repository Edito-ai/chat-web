import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ApiError, apiClient } from '@/lib/apiClient'

/**
 * Saved editing styles (backend2 `/styles`). A style is read off a reference video the person likes; an edit can then
 * follow it. The old backend has no `/styles`: there `items` stays null and the style controls are not shown.
 */
export interface StyleItem {
  id: string
  name: string
  created: string
  source: string
  description: string
  summary: string
  sheetUrl: string
  colours: { a: string; b: string; text?: string }
}

interface StylesState {
  /** null = this backend has no styles (or they have not loaded yet). */
  items: StyleItem[] | null
  /** The style the NEXT message follows; null = designed from the video. Kept per browser. */
  selected: string | null
  load: () => Promise<void>
  select: (id: string | null) => void
  remove: (id: string) => Promise<void>
}

export async function fetchStyles(): Promise<StyleItem[] | null> {
  try {
    const raw = (await apiClient.get('/styles')) as { items?: StyleItem[] }
    return raw.items ?? []
  } catch (e) {
    // 404 / 405: this server does not do styles. Anything else: keep what was shown before.
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return null
    throw e
  }
}

export const useStyles = create<StylesState>()(
  persist(
    (set, get) => ({
      items: null,
      selected: null,
      load: async () => {
        try {
          const items = await fetchStyles()
          const selected = get().selected
          set({ items, selected: items && selected && items.some((s) => s.id === selected) ? selected : null })
        } catch {
          // the list stays as it was; the picker still works with it
        }
      },
      select: (id) => set({ selected: id }),
      remove: async (id) => {
        const before = get().items
        set({ items: (before ?? []).filter((s) => s.id !== id), selected: get().selected === id ? null : get().selected })
        try {
          await apiClient.delete(`/styles/${encodeURIComponent(id)}`)
        } catch {
          set({ items: before })
        }
      },
    }),
    { name: 'edito.chat-web.styles.v1', partialize: (s) => ({ selected: s.selected }) },
  ),
)
