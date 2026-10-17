import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../configs/FirebaseConfig'
import { getNextRequestCount, getUserXp, stageUserRequestMetadata } from './userProfile'
import type { ActiveSidequest, SidequestRequestPayload } from '../types/sidequest'

export const SIDEQUEST_XP_VALUE = 25

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
      isActive: true,
      xpValue: SIDEQUEST_XP_VALUE,
    })

    return nextRequestCount
  })

  return { id: sidequestRef.id, requestCount }
}

function parseActiveSidequest(
  id: string,
  data: Record<string, unknown>,
): ActiveSidequest {
  const request = data.request
  if (
    typeof request !== 'object' ||
    request === null ||
    !('location' in request) ||
    typeof request.location !== 'string'
  ) {
    throw new Error(`Saved sidequest ${id} has an invalid location.`)
  }
  if (
    data.xpValue !== undefined &&
    (typeof data.xpValue !== 'number' ||
      !Number.isSafeInteger(data.xpValue) ||
      data.xpValue < 0)
  ) {
    throw new Error(`Saved sidequest ${id} has an invalid XP value.`)
  }

  return {
    id,
    location: request.location,
    xpValue: typeof data.xpValue === 'number' ? data.xpValue : SIDEQUEST_XP_VALUE,
  }
}

export function subscribeToActiveSidequests(
  userId: string,
  onChange: (sidequests: ActiveSidequest[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!userId.trim()) throw new Error('Sign in to view active sidequests.')

  return onSnapshot(
    collection(db, 'Users', userId, 'sidequests'),
    (snapshot) => {
      try {
        const activeSidequests = snapshot.docs
          .filter((sidequest) => {
            const data = sidequest.data()
            return data.isActive === true || (
              data.isActive === undefined && data.status === 'prepared'
            )
          })
          .map((sidequest) => parseActiveSidequest(sidequest.id, sidequest.data()))
        onChange(activeSidequests)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Could not read active sidequests.')
      }
    },
    (error: Error) => onError(error.message),
  )
}

export async function completeSidequest(userId: string, sidequestId: string): Promise<number> {
  if (!userId.trim()) throw new Error('Sign in to complete a sidequest.')
  if (!sidequestId.trim()) throw new Error('Choose a valid sidequest to complete.')

  const userRef = doc(db, 'Users', userId)
  const sidequestRef = doc(db, 'Users', userId, 'sidequests', sidequestId)

  return runTransaction(db, async (transaction) => {
    const sidequestSnapshot = await transaction.get(sidequestRef)
    if (!sidequestSnapshot.exists()) throw new Error('This sidequest could not be found.')

    const sidequestData = sidequestSnapshot.data()
    const isActive = sidequestData.isActive === true || (
      sidequestData.isActive === undefined && sidequestData.status === 'prepared'
    )
    if (!isActive) return 0

    const xpValue: unknown = sidequestData.xpValue ?? SIDEQUEST_XP_VALUE
    if (
      typeof xpValue !== 'number' ||
      !Number.isSafeInteger(xpValue) ||
      xpValue < 0
    ) {
      throw new Error('This sidequest has an invalid XP reward.')
    }

    const userSnapshot = await transaction.get(userRef)
    const nextXp = getUserXp(userSnapshot.exists() ? userSnapshot.data() : undefined) + xpValue
    if (!Number.isSafeInteger(nextXp)) throw new Error('Your XP total is too large to update.')

    transaction.update(sidequestRef, {
      isActive: false,
      completedAt: serverTimestamp(),
    })
    transaction.set(userRef, { xp: nextXp }, { merge: true })
    return xpValue
  })
}
