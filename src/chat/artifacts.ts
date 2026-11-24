import type { ChatAssistantMessage, ChatMessage } from './chatTypes'

/** What the side panel can show for one assistant message. */
export type ArtifactKind = 'look' | 'frames' | 'video' | 'clips' | 'seen'

export interface Artifact {
  /** The message id: the panel shows this message's thing. */
  id: string
  kind: ArtifactKind
  /** 1-based among the artifacts of the same kind in this chat (the "v2" of a video). */
  version: number
  msg: ChatAssistantMessage
}

/** Which thing, if any, a message puts in the panel. A choice that waits for the person wins over what is already finished. */
export function kindOf(m: ChatAssistantMessage): ArtifactKind | null {
  if (m.lookChoice?.open) return 'look'
  if (m.framesReview?.open) return 'frames'
  if (m.status === 'complete' && m.kind === 'clips') return 'clips'
  if (m.status === 'complete' && m.result) return 'video'
  const a = m.analysis
  if (a && (a.beforeSheet || a.afterSheet || a.plannedSheet)) return 'seen'
  return null
}

/** Everything in a chat that lives in the panel, oldest first, with its version number. */
export function listArtifacts(messages: readonly ChatMessage[]): Artifact[] {
  const counts: Record<string, number> = {}
  const out: Artifact[] = []
  for (const m of messages) {
    if (m.role !== 'assistant') continue
    const kind = kindOf(m)
    if (!kind) continue
    counts[kind] = (counts[kind] ?? 0) + 1
    out.push({ id: m.id, kind, version: counts[kind]!, msg: m })
  }
  return out
}

/** The versions of one kind, for the switcher in the panel header. */
export function versionsOf(all: readonly Artifact[], kind: ArtifactKind): Artifact[] {
  return all.filter((a) => a.kind === kind)
}

/** A choice that is waiting for the person (a look, frames) opens the panel by itself; finished things do too. Not "seen". */
export function opensByItself(kind: ArtifactKind): boolean {
  return kind !== 'seen'
}
