import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/auth/authStore'
import { AuthScreen } from '@/auth/AuthScreen'
import { ChatScreen } from '@/chat/ChatScreen'
import { useT } from '@/i18n'

export function App() {
  const status = useAuth((s) => s.status)
  const { t } = useT()

  useEffect(() => {
    void useAuth.getState().restoreSession()
  }, [])

  if (status === 'restoring') {
    return (
      <div className="app-shell grid h-full place-items-center text-ink-3" role="status">
        <span className="flex items-center gap-2 text-body">
          <Loader2 size={16} className="animate-spin" aria-hidden /> {t('auth.restoring')}
        </span>
      </div>
    )
  }
  return status === 'authenticated' ? <ChatScreen /> : <AuthScreen />
}
