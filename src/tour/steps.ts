import type { LucideIcon } from 'lucide-react'
import { Compass, FolderKanban, LibraryBig, MessageSquareText, Paperclip, Send, SquarePen, Sparkles, UserRound } from 'lucide-react'
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
    points: ['tour.composer.p1', 'tour.composer.p2'],
    target: '[data-tour="composer"]',
    placement: 'top',
  },
  {
    id: 'attach',
    icon: Paperclip,
    title: 'tour.attach.title',
    body: 'tour.attach.body',
    points: ['tour.attach.p1', 'tour.attach.p2', 'tour.attach.p3'],
    target: '[data-testid="chat-attach-menu"]',
    placement: 'right',
    ui: () => ({ attachMenu: true }),
  },
  {
    id: 'send',
    icon: Send,
    title: 'tour.send.title',
    body: 'tour.send.body',
    points: ['tour.send.p1', 'tour.send.p2'],
    target: '[data-testid="chat-send"]',
    placement: 'top',
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
