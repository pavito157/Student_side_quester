import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../configs/FirebaseConfig'
import { getNextRequestCount, getUserXp, stageUserRequestMetadata } from './userProfile'
import type { ActiveSidequest, SidequestRequestPayload } from '../types/sidequest'

export const SIDEQUEST_XP_VALUE = 25
export const SIDEQUEST_RETENTION_MS = 3 * 24 * 60 * 60 * 1000

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
      expiresAt: Timestamp.fromMillis(Date.now() + SIDEQUEST_RETENTION_MS),
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
  const request = normalizeSidequestRequest(data.request)
  if (!request) {
    throw new Error(`Saved sidequest ${id} has invalid request details.`)
  }
  if (
    data.xpValue !== undefined &&
    (typeof data.xpValue !== 'number' ||
      !Number.isSafeInteger(data.xpValue) ||
      data.xpValue < 0)
  ) {
    throw new Error(`Saved sidequest ${id} has an invalid XP value.`)
  }

  const createdAt = data.createdAt instanceof Timestamp
    ? data.createdAt
    : Timestamp.now()
  const expiresAt = data.expiresAt instanceof Timestamp
    ? data.expiresAt
    : Timestamp.fromMillis(createdAt.toMillis() + SIDEQUEST_RETENTION_MS)

  return {
    id,
    request,
    xpValue: typeof data.xpValue === 'number' ? data.xpValue : SIDEQUEST_XP_VALUE,
    createdAt: createdAt.toDate().toISOString(),
    expiresAt: expiresAt.toDate().toISOString(),
  }
}

function normalizeSidequestRequest(value: unknown): SidequestRequestPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const request = value as Record<string, unknown>
  const time = request.time
  const budget = request.budget
  const distance = request.distance

  if (
    typeof request.preferences !== 'string' ||
    typeof request.username !== 'string' ||
    typeof request.location !== 'string' ||
    (request.latitude !== undefined &&
      request.latitude !== null &&
      typeof request.latitude !== 'number') ||
    (request.longitude !== undefined &&
      request.longitude !== null &&
      typeof request.longitude !== 'number') ||
    typeof time !== 'object' ||
    time === null ||
    typeof budget !== 'object' ||
    budget === null ||
    !Array.isArray(request.goals) ||
    !request.goals.every((goal) => typeof goal === 'string') ||
    (request.vibePreferences !== undefined &&
      request.vibePreferences !== null &&
      typeof request.vibePreferences !== 'string')
  ) {
    return null
  }

  const timeData = time as Record<string, unknown>
  const budgetData = budget as Record<string, unknown>
  const timeSelection = timeData.selection
  const customMinutes = timeData.customMinutes
  if (
    (timeSelection !== 'any' &&
      timeSelection !== '30' &&
      timeSelection !== '60' &&
      timeSelection !== '120' &&
      timeSelection !== 'custom') ||
    (customMinutes !== undefined &&
      customMinutes !== null &&
      typeof customMinutes !== 'number')
  ) {
    return null
  }

  const budgetSelection = budgetData.selection
  const customDollars = budgetData.customDollars
  if (
    (budgetSelection !== 'any' &&
      budgetSelection !== '0' &&
      budgetSelection !== '10' &&
      budgetSelection !== '10-25' &&
      budgetSelection !== 'custom') ||
    (customDollars !== undefined &&
      customDollars !== null &&
      typeof customDollars !== 'number')
  ) {
    return null
  }

  let normalizedDistance: SidequestRequestPayload['distance'] = null
  if (distance !== undefined && distance !== null) {
    if (
      typeof distance !== 'object' ||
      !('maxDistance' in distance) ||
      typeof distance.maxDistance !== 'number' ||
      !Number.isFinite(distance.maxDistance) ||
      distance.maxDistance < 0 ||
      !('unit' in distance) ||
      distance.unit !== 'miles'
    ) {
      return null
    }
    normalizedDistance = { maxDistance: distance.maxDistance, unit: 'miles' }
  }

  return {
    preferences: request.preferences,
    username: request.username,
    location: request.location,
    latitude: typeof request.latitude === 'number' ? request.latitude : null,
    longitude: typeof request.longitude === 'number' ? request.longitude : null,
    time: {
      selection: timeSelection,
      customMinutes: typeof customMinutes === 'number' ? customMinutes : null,
    },
    budget: {
      selection: budgetSelection,
      customDollars: typeof customDollars === 'number' ? customDollars : null,
    },
    distance: normalizedDistance,
    goals: request.goals,
    vibePreferences: typeof request.vibePreferences === 'string'
      ? request.vibePreferences
      : null,
  }
}

async function deleteSidequestIfExpired(userId: string, sidequestId: string): Promise<void> {
  const sidequestRef = doc(db, 'Users', userId, 'sidequests', sidequestId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(sidequestRef)
    if (!snapshot.exists()) return

    const data = snapshot.data()
    const isActive = data.isActive === true || (
      data.isActive === undefined && data.status === 'prepared'
    )
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt : null
    const expiresAt = data.expiresAt instanceof Timestamp
      ? data.expiresAt
      : createdAt
        ? Timestamp.fromMillis(createdAt.toMillis() + SIDEQUEST_RETENTION_MS)
        : null

    if (isActive && expiresAt && expiresAt.toMillis() <= Date.now()) {
      transaction.delete(sidequestRef)
    }
  })
}

export function subscribeToActiveSidequest(
  userId: string,
  sidequestId: string,
  onChange: (sidequest: ActiveSidequest | null) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!userId.trim()) throw new Error('Sign in to view this sidequest.')
  if (!sidequestId.trim()) throw new Error('Choose a valid sidequest.')

  const sidequestRef = doc(db, 'Users', userId, 'sidequests', sidequestId)
  let expiryTimer: number | undefined
  let isStopped = false
  let isDeletingExpired = false

  const unsubscribe = onSnapshot(
    sidequestRef,
    (snapshot) => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
      expiryTimer = undefined

      try {
        if (!snapshot.exists()) {
          onChange(null)
          return
        }

        const data = snapshot.data()
        const isActive = data.isActive === true || (
          data.isActive === undefined && data.status === 'prepared'
        )
        if (!isActive) {
          onChange(null)
          return
        }

        const sidequest = parseActiveSidequest(snapshot.id, data)
        const delay = Date.parse(sidequest.expiresAt) - Date.now()
        if (delay <= 0) {
          onChange(null)
          if (!isDeletingExpired) {
            isDeletingExpired = true
            void deleteSidequestIfExpired(userId, sidequestId)
              .catch((error: unknown) => {
                if (!isStopped) {
                  onError(error instanceof Error
                    ? error.message
                    : 'Could not remove this expired sidequest.')
                }
              })
              .finally(() => {
                isDeletingExpired = false
              })
          }
          return
        }

        onChange(sidequest)
        expiryTimer = window.setTimeout(() => {
          onChange(null)
          if (isDeletingExpired) return
          isDeletingExpired = true
          void deleteSidequestIfExpired(userId, sidequestId)
            .catch((error: unknown) => {
              if (!isStopped) {
                onError(error instanceof Error
                  ? error.message
                  : 'Could not remove this expired sidequest.')
              }
            })
            .finally(() => {
              isDeletingExpired = false
            })
        }, delay + 50)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Could not read this sidequest.')
      }
    },
    (error: Error) => onError(error.message),
  )

  return () => {
    isStopped = true
    if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
    unsubscribe()
  }
}

export function subscribeToActiveSidequests(
  userId: string,
  onChange: (sidequests: ActiveSidequest[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!userId.trim()) throw new Error('Sign in to view active sidequests.')

  let expiryTimer: number | undefined
  let isStopped = false
  const pendingExpirations = new Set<string>()

  async function expireSidequests(sidequestIds: string[]) {
    const results = await Promise.allSettled(
      sidequestIds.map((id) => deleteSidequestIfExpired(userId, id)),
    )
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (!isStopped && failure) {
      onError(failure.reason instanceof Error
        ? failure.reason.message
        : 'Could not remove expired sidequests.')
    }
    sidequestIds.forEach((id) => pendingExpirations.delete(id))
  }

  const unsubscribe = onSnapshot(
    collection(db, 'Users', userId, 'sidequests'),
    (snapshot) => {
      try {
        if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
        const now = Date.now()
        const activeSidequests: ActiveSidequest[] = []
        const expiredIds: string[] = []

        for (const sidequest of snapshot.docs) {
          const data = sidequest.data()
          const isActive = data.isActive === true || (
            data.isActive === undefined && data.status === 'prepared'
          )
          if (!isActive) continue

          const parsed = parseActiveSidequest(sidequest.id, data)
          if (Date.parse(parsed.expiresAt) <= now) {
            expiredIds.push(parsed.id)
          } else {
            activeSidequests.push(parsed)
          }
        }

        onChange(activeSidequests)

        const newlyExpiredIds = expiredIds.filter((id) => !pendingExpirations.has(id))
        newlyExpiredIds.forEach((id) => pendingExpirations.add(id))
        if (newlyExpiredIds.length > 0) void expireSidequests(newlyExpiredIds)

        const nextExpiry = Math.min(
          ...activeSidequests.map((sidequest) => Date.parse(sidequest.expiresAt)),
        )
        if (Number.isFinite(nextExpiry)) {
          const delay = Math.max(0, nextExpiry - Date.now() + 50)
          expiryTimer = window.setTimeout(() => {
            const dueIds = activeSidequests
              .filter((sidequest) => Date.parse(sidequest.expiresAt) <= Date.now())
              .map(({ id }) => id)
            dueIds.forEach((id) => pendingExpirations.add(id))
            void expireSidequests(dueIds)
          }, delay)
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Could not read active sidequests.')
      }
    },
    (error: Error) => onError(error.message),
  )

  return () => {
    isStopped = true
    if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
    unsubscribe()
  }
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
    const createdAt = sidequestData.createdAt instanceof Timestamp
      ? sidequestData.createdAt
      : null
    const expiresAt = sidequestData.expiresAt instanceof Timestamp
      ? sidequestData.expiresAt
      : createdAt
        ? Timestamp.fromMillis(createdAt.toMillis() + SIDEQUEST_RETENTION_MS)
        : null
    if (expiresAt && expiresAt.toMillis() <= Date.now()) {
      transaction.delete(sidequestRef)
      return -1
    }

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
