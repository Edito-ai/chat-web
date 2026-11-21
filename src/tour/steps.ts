import type { LucideIcon } from 'lucide-react'
import { Compass, Film, FolderKanban, LibraryBig, MessageSquareText, Send, SquarePen, Sparkles, UserRound } from 'lucide-react'
import type { MessageKey } from '@/i18n'
import type { Placement } from './place'
import type { TourUi } from './tourStore'

export interface TourStep {
  id: string
  icon: LucideIcon
  title: MessageKey
  body: MessageKey
  /** Short tips shown as a list under the body. */
  points?: MessageKey[]
  /** CSS selector of what to light up. None = a centred card (welcome, finish). The first VISIBLE match is used. */
  target?: string | ((mobile: boolean) => string)
  placement?: Placement
  /** Draw an arrow beside the target that points at it (single menu lines). */
  point?: boolean
  /** A looping demo played over the target (see ComposerDemo). */
  demo?: 'composer' | 'send'
  /** What the tour opens for this step. */
  ui?: (mobile: boolean) => Partial<TourUi>
}

/** The sidebar lives in a drawer on phones and can be collapsed on desktop: open whichever is needed. */
const sidebarOpen = (mobile: boolean): Partial<TourUi> => (mobile ? { drawer: true } : { sidebar: true })

export const TOUR_STEPS: TourStep[] = [
  { id: 'welcome', icon: Sparkles, title: 'tour.welcome.title', body: 'tour.welcome.body' },
  {
    id: 'composer',
    icon: MessageSquareText,
    title: 'tour.composer.title',
    body: 'tour.composer.body',
    points: ['tour.composer.p1', 'tour.composer.p2', 'tour.composer.p3'],
    target: '[data-tour="composer"]',
    placement: 'left',
    demo: 'composer',
  },
  // The paperclip: one button that takes photos and videos.
  {
    id: 'attach-footage',
    icon: Film,
    title: 'tour.attach.footage.title',
    body: 'tour.attach.footage.body',
    target: '[data-testid="chat-attach"]',
    placement: 'right',
    point: true,
  },
  {
    id: 'send',
    icon: Send,
    title: 'tour.send.title',
    body: 'tour.send.body',
    points: ['tour.send.p1', 'tour.send.p2', 'tour.send.p3'],
    target: '[data-tour="composer"]',
    placement: 'left',
    demo: 'send',
  },
  {
    id: 'new',
    icon: SquarePen,
    title: 'tour.new.title',
    body: 'tour.new.body',
    target: '[data-testid="chat-new-side"]',
    placement: 'right',
    ui: sidebarOpen,
  },
  {
    id: 'history',
    icon: FolderKanban,
    title: 'tour.history.title',
    body: 'tour.history.body',
    points: ['tour.history.p1', 'tour.history.p2'],
    target: '[data-tour="history"]',
    placement: 'right',
    ui: sidebarOpen,
  },
  {
    id: 'library',
    icon: LibraryBig,
    title: 'tour.library.title',
    body: 'tour.library.body',
    target: '[data-testid="chat-library"]',
    placement: 'right',
    ui: sidebarOpen,
  },
  {
    id: 'profile',
    icon: UserRound,
    title: 'tour.profile.title',
    body: 'tour.profile.body',
    points: ['tour.profile.p1', 'tour.profile.p2', 'tour.profile.p3'],
    target: '[data-testid="chat-profile"] [role="menu"]',
    placement: 'right',
    ui: (mobile) => ({ ...sidebarOpen(mobile), profileMenu: true }),
  },
  { id: 'done', icon: Compass, title: 'tour.done.title', body: 'tour.done.body' },
]

export const targetOf = (step: TourStep, mobile: boolean): string | null =>
  step.target === undefined ? null : typeof step.target === 'function' ? step.target(mobile) : step.target
