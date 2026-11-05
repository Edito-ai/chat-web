import { Orb } from './Orb'

/**
 * The assistant's avatar in the chat: the orb. A small still orb at rest, a larger bouncing one while an edit runs, with the
 * thought card pointing at it. (The Broll B lives in the header, on the login screen and on the home screen.)
 */
export function Presence({ active = false, idle = false }: { active?: boolean; idle?: boolean }) {
  // `idle`: the newest reply is waiting for the person, so the orb floats gently instead of sitting still.
  return <Orb mode={active ? 'run' : idle ? 'idle' : 'still'} className={active ? 'h-12 w-12 sm:h-16 sm:w-16' : 'h-9 w-9'} />
}
