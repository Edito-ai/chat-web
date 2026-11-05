/** Test ids of the transcript UI, in one typed place so tests and components cannot drift apart. */
export const TID = {
  transcript: 'chat-transcript',
  thought: 'chat-thought',
  say: 'chat-say',
  toolsFold: 'chat-tools-fold',
  toolsToggle: 'chat-tools-toggle',
  toolsList: 'chat-tools-list',
  tool: 'chat-tool',
  live: 'chat-live-line',
  avatar: 'chat-avatar',
  summary: 'chat-activity-summary',
  credit: 'credit-banner',
  creditPhone: 'credit-phone',
  creditClaim: 'credit-claim',
  creditDismiss: 'credit-dismiss',
  creditError: 'credit-error',
  creditDone: 'credit-done',
  needCredit: 'chat-need-credit',
} as const

export type TestId = (typeof TID)[keyof typeof TID]
