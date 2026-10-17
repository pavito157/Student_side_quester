import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../configs/FirebaseConfig'
import { getNextRequestCount, getUserXp, stageUserRequestMetadata } from './userProfile'
import type { SidequestRequestPayload } from '../types/sidequest'

type SavedSidequestMetadata = {
  id: string
  requestCount: number
}

export async function saveSidequestRequest(
  userId: string,
  email: string | null,
  request: SidequestRequestPayload,
): Promise<SavedSidequestMetadata> {
  if (!userId.trim()) throw new Error('Sign in to save sidequest requests.')
  if (email !== null && !email.trim()) {
    throw new Error('The account email must be a non-empty email address.')
  }

  const userRef = doc(db, 'Users', userId)
  const sidequestRef = doc(collection(db, 'Users', userId, 'sidequests'))

  const requestCount = await runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef)
    const currentUserData = userSnapshot.exists() ? userSnapshot.data() : undefined
    const nextRequestCount = getNextRequestCount(currentUserData)

    stageUserRequestMetadata(transaction, userRef, {
      email,
      username: request.username,
      requestCount: nextRequestCount,
      xp: getUserXp(currentUserData),
    })
    
    transaction.set(sidequestRef, {
      request,
      createdAt: serverTimestamp(),
      status: 'prepared',
    })

    return nextRequestCount
  })

  return { id: sidequestRef.id, requestCount }
}
