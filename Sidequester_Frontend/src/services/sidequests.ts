import { collection, doc, onSnapshot, Timestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from '../configs/FirebaseConfig'
import {
  MAX_QUEST_REPLACEMENTS, requestPhotoProof, requestQuestAbandon, requestQuestCompletion,
  requestQuestPhotoProofSkip, type StopCompletionResult,
} from './questAssignment'
import { MAX_QUEST_STEPS, MAX_QUEST_STOPS, type ActiveSidequest } from '../types/sidequest'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type ActiveDestination = NonNullable<ActiveSidequest['destinations']>[number]

function parseDestinations(value: unknown, fallback: ActiveDestination): ActiveDestination[] | null {
  const candidates = value === undefined || (Array.isArray(value) && value.length === 0)
    ? [fallback]
    : Array.isArray(value) ? value : null
  if (!candidates) return null
  if (candidates.length > MAX_QUEST_STOPS) return null
  const parsed: ActiveDestination[] = []
  for (const candidate of candidates) {
    if (!isRecord(candidate)
      || typeof candidate.locationName !== 'string' || !candidate.locationName.trim()
      || typeof candidate.latitude !== 'number' || !Number.isFinite(candidate.latitude)
      || Math.abs(candidate.latitude) > 90
      || typeof candidate.longitude !== 'number' || !Number.isFinite(candidate.longitude)
      || Math.abs(candidate.longitude) > 180
      || (candidate.placeId !== undefined && candidate.placeId !== null && typeof candidate.placeId !== 'string')) {
      return null
    }
    parsed.push({
      locationName: candidate.locationName,
      placeId: typeof candidate.placeId === 'string' ? candidate.placeId : null,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    })
  }
  return parsed.length > 0 ? parsed : null
}

function parseCompletedStops(value: unknown, totalStops: number): number[] | null {
  if (!Array.isArray(value) || value.length > totalStops) return null
  if (!value.every((index) => typeof index === 'number' && Number.isSafeInteger(index)
    && index >= 0 && index < totalStops)) return null
  return value.every((index, position) => index === position) ? value : null
}

function parseStepDestinationIndexes(
  value: unknown, steps: string[], destinations: ActiveDestination[],
): number[] | null {
  const indexes = value === undefined
    ? destinations.length > 1 && steps.length === destinations.length
      ? destinations.map((_, index) => index)
      : steps.map(() => 0)
    : value
  if (!Array.isArray(indexes) || indexes.length !== steps.length
      || indexes.length > MAX_QUEST_STEPS
      || !indexes.every((index) => typeof index === 'number' && Number.isSafeInteger(index)
        && index >= 0 && index < destinations.length)
      || !indexes.every((index, position) => position === 0 || indexes[position - 1] <= index)
      || new Set(indexes).size !== destinations.length) return null
  return indexes
}

function parsePhotoSteps(
  value: unknown, steps: string[], methods: ActiveSidequest['stepProofMethods'],
): number[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > steps.length
      || !value.every((index) => typeof index === 'number' && Number.isSafeInteger(index)
        && index >= 0 && index < steps.length && methods[index] === 'photo')
      || new Set(value).size !== value.length) return null
  return value
}

// Generated assignments are written and completed only by FastAPI. Old
// "prepared" request previews are not generated quests and cannot earn XP.
export function parseActiveSidequest(id: string, data: Record<string, unknown>, userId: string): ActiveSidequest | null {
  if (data.status !== 'assigned' || data.isActive !== true) return null
  const userRequest = data.userRequest === undefined ? null : data.userRequest
  const replacementCount = data.replacementCount === undefined ? 0 : data.replacementCount
  const destinations = parseDestinations(data.destinations, {
    locationName: typeof data.locationName === 'string' ? data.locationName : '',
    placeId: typeof data.placeId === 'string' ? data.placeId : null,
    latitude: typeof data.latitude === 'number' ? data.latitude : Number.NaN,
    longitude: typeof data.longitude === 'number' ? data.longitude : Number.NaN,
  })
  const completedStops = destinations
    ? parseCompletedStops(data.completedStops ?? [], destinations.length)
    : null
  const steps = Array.isArray(data.steps) && data.steps.length <= MAX_QUEST_STEPS
    && data.steps.every((step) => typeof step === 'string')
    ? data.steps as string[]
    : null
  const proofMethods = data.stepProofMethods === undefined
    ? steps?.map(() => 'location' as const) ?? null
    : Array.isArray(data.stepProofMethods)
      && data.stepProofMethods.length === steps?.length
      && data.stepProofMethods.every((method) => method === 'location' || method === 'photo' || method === 'recreation')
      ? data.stepProofMethods as ActiveSidequest['stepProofMethods']
      : null
  const stepDestinationIndexes = steps && destinations
    ? parseStepDestinationIndexes(data.stepDestinationIndexes, steps, destinations)
    : null
  const verifiedPhotoSteps = steps && proofMethods
    ? parsePhotoSteps(data.verifiedPhotoSteps, steps, proofMethods)
    : null
  const skippedPhotoSteps = steps && proofMethods
    ? parsePhotoSteps(data.skippedPhotoSteps, steps, proofMethods)
    : null
  const xpAwardedSoFar = data.xpAwardedSoFar === undefined ? undefined : data.xpAwardedSoFar
  if (data.userId !== userId || data.ownerId !== userId || data.questId !== id
      || typeof data.title !== 'string' || !data.title.trim()
      || typeof data.description !== 'string' || typeof data.locationName !== 'string'
      || !steps || !steps.length || !proofMethods
      || !stepDestinationIndexes
      || !verifiedPhotoSteps || !skippedPhotoSteps
      || verifiedPhotoSteps.some((step) => skippedPhotoSteps.includes(step))
      || (xpAwardedSoFar !== undefined
        && (typeof xpAwardedSoFar !== 'number' || !Number.isSafeInteger(xpAwardedSoFar) || xpAwardedSoFar < 0))
      || typeof data.latitude !== 'number' || !Number.isFinite(data.latitude) || Math.abs(data.latitude) > 90
      || typeof data.longitude !== 'number' || !Number.isFinite(data.longitude) || Math.abs(data.longitude) > 180
      || (data.placeId !== undefined && data.placeId !== null && typeof data.placeId !== 'string')
      || !destinations || !completedStops
      || destinations[0].locationName !== data.locationName
      || destinations[0].placeId !== (typeof data.placeId === 'string' ? data.placeId : null)
      || destinations[0].latitude !== data.latitude || destinations[0].longitude !== data.longitude
      || new Set(destinations.map((stop) => `${stop.latitude},${stop.longitude}`)).size !== destinations.length
      || new Set(destinations.flatMap((stop) => stop.placeId ? [stop.placeId] : [])).size
        !== destinations.filter((stop) => stop.placeId).length
      || typeof data.xpReward !== 'number' || !Number.isSafeInteger(data.xpReward) || data.xpReward < 0
      || typeof data.estimatedMinutes !== 'number' || !Number.isSafeInteger(data.estimatedMinutes) || data.estimatedMinutes <= 0
      || typeof data.estimatedCostDollars !== 'number' || !Number.isFinite(data.estimatedCostDollars) || data.estimatedCostDollars < 0
      || typeof replacementCount !== 'number' || !Number.isInteger(replacementCount)
      || replacementCount < 0 || replacementCount > MAX_QUEST_REPLACEMENTS
      || !(data.assignedAt instanceof Timestamp)
      || (userRequest !== null && !isRecord(userRequest))) {
    throw new Error(`Saved sidequest ${id} has invalid assignment details.`)
  }
  if (isRecord(userRequest) && typeof userRequest.multiQuest === 'boolean'
    && (userRequest.multiQuest ? destinations.length < 2 : destinations.length !== 1)) {
    throw new Error(`Saved sidequest ${id} has invalid route details.`)
  }
  return {
    id, title: data.title, description: data.description, steps,
    stepProofMethods: proofMethods, stepDestinationIndexes, verifiedPhotoSteps, skippedPhotoSteps,
    locationName: data.locationName,
    placeId: typeof data.placeId === 'string' ? data.placeId : null,
    destinations,
    completedStops,
    xpAwardedSoFar,
    latitude: data.latitude, longitude: data.longitude,
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

export function submitSidequestPhotoProof(
  userId: string, sidequestId: string, stepIndex: number, image: Blob,
) {
  return requestPhotoProof(userId, sidequestId, stepIndex, image)
}

export function skipSidequestPhotoProof(userId: string, sidequestId: string, stepIndex: number) {
  return requestQuestPhotoProofSkip(userId, sidequestId, stepIndex)
}

export async function completeSidequest(
  userId: string, sidequestId: string, stopIndex = 0, requiresLocation = true,
): Promise<StopCompletionResult> {
  if (!userId.trim() || !sidequestId.trim()) throw new Error('Sign in and choose a valid sidequest.')
  if (!requiresLocation) {
    return requestQuestCompletion(userId, sidequestId, {
      latitude: null, longitude: null, accuracy: null,
    }, stopIndex)
  }
  if (!navigator.geolocation) throw new Error('Your browser does not support location verification.')
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve,
      () => reject(new Error('Could not read your location. Enable precise location access and try again.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
  })
  return requestQuestCompletion(userId, sidequestId, {
    latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy,
  }, stopIndex)
}

export async function abandonSidequest(userId: string, sidequestId: string): Promise<void> {
  if (!userId.trim() || !sidequestId.trim()) throw new Error('Sign in and choose a valid sidequest.')
  return requestQuestAbandon(userId, sidequestId)
}
