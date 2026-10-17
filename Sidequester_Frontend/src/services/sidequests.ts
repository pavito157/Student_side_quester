import { collection, doc, onSnapshot, Timestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from '../configs/FirebaseConfig'
import { MAX_QUEST_REPLACEMENTS, requestQuestAbandon, requestQuestCompletion } from './questAssignment'
import type { ActiveSidequest } from '../types/sidequest'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Generated assignments are written and completed only by FastAPI. Old
// "prepared" request previews are not generated quests and cannot earn XP.
export function parseActiveSidequest(id: string, data: Record<string, unknown>, userId: string): ActiveSidequest | null {
  if (data.status !== 'assigned' || data.isActive !== true) return null
  const userRequest = data.userRequest === undefined ? null : data.userRequest
  const replacementCount = data.replacementCount === undefined ? 0 : data.replacementCount
  if (data.userId !== userId || data.ownerId !== userId || data.questId !== id
      || typeof data.title !== 'string' || !data.title.trim()
      || typeof data.description !== 'string' || typeof data.locationName !== 'string'
      || !Array.isArray(data.steps) || !data.steps.length || !data.steps.every((step) => typeof step === 'string')
      || typeof data.latitude !== 'number' || !Number.isFinite(data.latitude) || Math.abs(data.latitude) > 90
      || typeof data.longitude !== 'number' || !Number.isFinite(data.longitude) || Math.abs(data.longitude) > 180
      || typeof data.xpReward !== 'number' || !Number.isSafeInteger(data.xpReward) || data.xpReward < 0
      || typeof data.estimatedMinutes !== 'number' || !Number.isSafeInteger(data.estimatedMinutes) || data.estimatedMinutes <= 0
      || typeof data.estimatedCostDollars !== 'number' || !Number.isFinite(data.estimatedCostDollars) || data.estimatedCostDollars < 0
      || typeof replacementCount !== 'number' || !Number.isInteger(replacementCount)
      || replacementCount < 0 || replacementCount > MAX_QUEST_REPLACEMENTS
      || !(data.assignedAt instanceof Timestamp)
      || (userRequest !== null && !isRecord(userRequest))) {
    throw new Error(`Saved sidequest ${id} has invalid assignment details.`)
  }
  return {
    id, title: data.title, description: data.description, steps: data.steps,
    locationName: data.locationName, latitude: data.latitude, longitude: data.longitude,
    estimatedMinutes: data.estimatedMinutes, estimatedCostDollars: data.estimatedCostDollars,
    xpValue: data.xpReward, createdAt: data.assignedAt.toDate().toISOString(),
    userRequest, replacementCount,
  }
}

export function subscribeToActiveSidequest(
  userId: string, sidequestId: string,
  onChange: (sidequest: ActiveSidequest | null) => void, onError: (message: string) => void,
): Unsubscribe {
  if (!userId.trim() || !sidequestId.trim()) throw new Error('Sign in and choose a valid sidequest.')
  return onSnapshot(doc(db, 'Users', userId, 'sidequests', sidequestId), (snapshot) => {
    try {
      onChange(snapshot.exists() ? parseActiveSidequest(snapshot.id, snapshot.data(), userId) : null)
    } catch (error) { onError(error instanceof Error ? error.message : 'Could not read this sidequest.') }
  }, (error: Error) => onError(error.message))
}

export function subscribeToActiveSidequests(
  userId: string, onChange: (sidequests: ActiveSidequest[]) => void, onError: (message: string) => void,
): Unsubscribe {
  if (!userId.trim()) throw new Error('Sign in to view active sidequests.')
  return onSnapshot(collection(db, 'Users', userId, 'sidequests'), (snapshot) => {
    try {
      onChange(snapshot.docs.flatMap((item) => {
        const parsed = parseActiveSidequest(item.id, item.data(), userId)
        return parsed ? [parsed] : []
      }))
    } catch (error) { onError(error instanceof Error ? error.message : 'Could not read active sidequests.') }
  }, (error: Error) => onError(error.message))
}

export async function completeSidequest(userId: string, sidequestId: string): Promise<number> {
  if (!userId.trim() || !sidequestId.trim()) throw new Error('Sign in and choose a valid sidequest.')
  if (!navigator.geolocation) throw new Error('Your browser does not support location verification.')
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve,
      () => reject(new Error('Could not read your location. Enable precise location access and try again.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
  })
  return requestQuestCompletion(userId, sidequestId, {
    latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy,
  })
}

export async function abandonSidequest(userId: string, sidequestId: string): Promise<void> {
  if (!userId.trim() || !sidequestId.trim()) throw new Error('Sign in and choose a valid sidequest.')
  return requestQuestAbandon(userId, sidequestId)
}
