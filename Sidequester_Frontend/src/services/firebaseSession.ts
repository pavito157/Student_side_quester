import { inMemoryPersistence, setPersistence, signInWithCustomToken, signOut } from 'firebase/auth'
import { firebaseAuth } from '../configs/FirebaseConfig'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
let pendingTransition: Promise<void> = Promise.resolve()

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Account connection cancelled.', 'AbortError')
}

export function synchronizeFirebaseSession(
  userId: string | null,
  getClerkToken: () => Promise<string | null>,
  signal: AbortSignal,
): Promise<void> {
  // Serialize account switches, sign-out, and React StrictMode effects. A stale
  // sign-in must finish/clean up before the next account can become ready.
  const transition = pendingTransition.then(async () => {
    checkCancelled(signal)
    await firebaseAuth.authStateReady()
    checkCancelled(signal)
    await setPersistence(firebaseAuth, inMemoryPersistence)
    if (firebaseAuth.currentUser) await signOut(firebaseAuth)
    if (!userId) return

    try {
      const clerkToken = await getClerkToken()
      checkCancelled(signal)
      if (!clerkToken) throw new Error('Sign in again to connect your account.')
      const response = await fetch(`${apiBaseUrl}/auth/firebase`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${clerkToken}`, 'Content-Type': 'application/json' },
        body: '{}',
        credentials: 'omit',
        signal,
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        const detail = result && typeof result === 'object' && 'detail' in result ? result.detail : null
        throw new Error(typeof detail === 'string' ? detail : 'Could not connect your account.')
      }
      if (!result || typeof result !== 'object' || !('uid' in result) || result.uid !== userId
          || !('firebaseCustomToken' in result) || typeof result.firebaseCustomToken !== 'string') {
        throw new Error('The account connection returned an unexpected identity.')
      }
      checkCancelled(signal)
      const signedIn = await signInWithCustomToken(firebaseAuth, result.firebaseCustomToken)
      checkCancelled(signal)
      if (signedIn.user.uid !== userId) throw new Error('Your account identities do not match.')
      await signedIn.user.getIdToken()
      checkCancelled(signal)
    } catch (error) {
      await signOut(firebaseAuth)
      throw error
    }
  })
  pendingTransition = transition.catch(() => undefined)
  return transition
}

// Future quest API calls should use this ID token, not the Clerk session or
// Firebase custom token. The backend still verifies it independently.
export async function getFirebaseIdToken(expectedUserId: string): Promise<string> {
  const user = firebaseAuth.currentUser
  if (!user || user.uid !== expectedUserId) throw new Error('Your account is not connected yet.')
  return user.getIdToken()
}
