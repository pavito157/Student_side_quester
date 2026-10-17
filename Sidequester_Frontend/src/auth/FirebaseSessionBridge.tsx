import { SignOutButton, useAuth } from '@clerk/clerk-react'
import { useEffect, useState, type ReactNode } from 'react'
import { synchronizeFirebaseSession } from '../services/firebaseSession'

export default function FirebaseSessionBridge({ children }: { children: ReactNode }) {
  const { isLoaded, userId, sessionId, getToken } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const sessionKey = JSON.stringify([userId ?? null, sessionId ?? null, attempt])
  const [state, setState] = useState<{ key: string; error: string }>({ key: '', error: '' })

  useEffect(() => {
    if (!isLoaded) return
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    void synchronizeFirebaseSession(userId ?? null, () => getToken(), controller.signal)
      .then(() => { if (active) setState({ key: sessionKey, error: '' }) })
      .catch((error: unknown) => {
        if (active) setState({
          key: sessionKey,
          error: controller.signal.aborted ? 'Account connection timed out. Please retry.'
            : error instanceof Error ? error.message : 'Could not connect your account.',
        })
      })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [isLoaded, userId, sessionId, getToken, sessionKey])

  // Mount the existing signed-in UI only after Firebase is ready; its Firestore
  // hooks otherwise race Clerk sign-in. Signed-out UI also waits for sign-out.
  if (!isLoaded || state.key !== sessionKey) {
    return <p role="status" className="p-6">Connecting your account…</p>
  }
  if (state.error) {
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>{state.error}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mr-4 underline">
          Retry connection
        </button>
        {userId && <SignOutButton><button type="button" className="underline">Sign out</button></SignOutButton>}
      </div>
    )
  }
  return children
}
