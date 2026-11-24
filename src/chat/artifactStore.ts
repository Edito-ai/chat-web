import { create } from 'zustand'

/** Which message's thing is open in the side panel (null = the panel is shut). */
interface ArtifactPanelState {
  openId: string | null
  open: (id: string) => void
  close: () => void
}

export const useArtifactPanel = create<ArtifactPanelState>((set) => ({
  openId: null,
  open: (openId) => set({ openId }),
  close: () => set({ openId: null }),
}))
