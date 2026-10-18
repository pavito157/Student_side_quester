import { getFirebaseIdToken } from './firebaseSession'
import {
  MAX_QUEST_STEPS,
  MAX_QUEST_STOPS,
  type QuestProofMethod,
} from '../types/sidequest'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')).replace(/\/$/, '')

type ActivityTimeFilter = {
  selection: '' | 'any' | '30' | '60' | '120' | 'custom'
  customMinutes?: number | null
}

type BudgetFilter = {
  selection: '' | 'any' | '0' | '10' | '10-25' | 'custom'
  customDollars?: number | null
}

export type AssignQuestPayload = {
  location: string
  time: ActivityTimeFilter
  budget: BudgetFilter
  preferences?: string
  username?: string
  distance?: number | { maxDistance: number; unit: 'miles' } | null
  goals?: string[]
  vibePreferences?: string | null
  multiQuest?: boolean
  proofOptions?: QuestProofMethod[]
}

export type QuestPreviewResponse = {
  mode: 'test'
  saved: false
  filtersApplied: false
  message: string
  quest: {
    title: string
    description: string
    steps: string[]
    stepProofMethods?: QuestProofMethod[]
    stepDestinationIndexes?: number[]
    locationName: string
    estimatedMinutes: number
    estimatedCostDollars: number
  }
  // Diagnostic echo for integration testing, not a second request format.
  normalizedPreferences: Record<string, unknown>
}

export type GenerateQuestPayload = AssignQuestPayload & {
  // Coordinates of the selected place (or current location), not completion proof.
  originCoordinates?: { latitude: number; longitude: number } | null
}

export type QuestRequestTiming = {
  tokenMs: number
  requestMs: number
  totalMs: number
  serverTiming: string | null
}

export type QuestRequestOptions = {
  signal?: AbortSignal
  onTiming?: (timing: QuestRequestTiming) => void
}

export const MAX_ACTIVE_QUESTS = 3
export const MAX_QUEST_DESTINATIONS = MAX_QUEST_STOPS
export const MAX_QUEST_REPLACEMENTS = 3 // Legacy metadata only.

const now = () => typeof performance === 'undefined' ? Date.now() : performance.now()

export type GeneratedQuestResponse = Omit<QuestPreviewResponse, 'mode' | 'filtersApplied' | 'quest'> & {
  mode: 'generated'
  filtersApplied: boolean
  destinationVerified: boolean
  distanceStatus: 'not_requested' | 'pending' | 'verified'
  distanceMeters: number | null
  quest: Omit<QuestPreviewResponse['quest'], 'stepProofMethods' | 'stepDestinationIndexes'> & {
    locationAddress: string
    stepProofMethods: QuestProofMethod[]
    stepDestinationIndexes: number[]
  }
  destination: {
    locationName: string
    latitude: number
    longitude: number
    placeId: string | null
    scope: 'gainesville_city'
  } | null
  destinations: Array<{
    locationName: string
    latitude: number
    longitude: number
    placeId: string | null
    scope: 'gainesville_city'
  }>
}

export type SavedQuestResponse = {
  quest: Omit<QuestPreviewResponse['quest'], 'stepProofMethods' | 'stepDestinationIndexes'> & {
    id: string
    sourceOrganizationId?: string | null
    sourceOrganizationQuestId?: string | null
    placeId: string | null
    latitude: number
    longitude: number
    radiusMeters: number
    xpReward: number
    isActive: true
    stepProofMethods: QuestProofMethod[]
    stepDestinationIndexes: number[]
  }
  assignment: {
    id: string
    userId: string
    questId: string
    status: 'assigned'
    assignedAt: string
    completedAt: null
    xpAwarded: 0
    replacementCount?: number
  }
  reusedExisting: boolean
}

export type OrganizationQuestBoardItem = {
  organizationId: string
  organizationName: string
  questId: string
  title: string
  summary: string
  details: string
  timeLabel: string
  mapLocation: {
    name: string
    latitude: number
    longitude: number
  } | null
  mapLocationStatus: 'available' | 'missing' | 'invalid'
  xpPotential: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOrganizationQuestBoardItem(value: unknown): value is OrganizationQuestBoardItem {
  if (!isRecord(value)) return false
  const location = value.mapLocation
  const hasValidLocation = location === null || (
    isRecord(location)
    && typeof location.name === 'string' && location.name.trim().length > 0
    && typeof location.latitude === 'number' && Number.isFinite(location.latitude)
    && Math.abs(location.latitude) <= 90
    && typeof location.longitude === 'number' && Number.isFinite(location.longitude)
    && Math.abs(location.longitude) <= 180
  )
  const hasValidLocationStatus = value.mapLocationStatus === 'available'
    ? location !== null
    : (value.mapLocationStatus === 'missing' || value.mapLocationStatus === 'invalid')
      && location === null

  return typeof value.organizationId === 'string' && value.organizationId.trim().length > 0
    && !value.organizationId.includes('/')
    && typeof value.organizationName === 'string' && value.organizationName.trim().length > 0
    && typeof value.questId === 'string' && value.questId.trim().length > 0
    && !value.questId.includes('/')
    && typeof value.title === 'string' && value.title.trim().length > 0
    && typeof value.summary === 'string' && value.summary.trim().length > 0
    && typeof value.details === 'string' && value.details.trim().length > 0
    && typeof value.timeLabel === 'string' && value.timeLabel.trim().length > 0
    && hasValidLocation
    && hasValidLocationStatus
    && typeof value.xpPotential === 'number'
    && Number.isSafeInteger(value.xpPotential)
    && value.xpPotential >= 5 && value.xpPotential <= 50
}

function isPreview(value: unknown): value is QuestPreviewResponse {
  if (!isRecord(value) || value.mode !== 'test' || value.saved !== false
      || value.filtersApplied !== false || typeof value.message !== 'string'
      || !isRecord(value.quest) || !isRecord(value.normalizedPreferences)) return false
  return isQuestContent(value.quest)
}

function isQuestContent(quest: unknown): quest is QuestPreviewResponse['quest'] & Record<string, unknown> {
  if (!isRecord(quest)) return false
  return ['title', 'description', 'locationName'].every(
    (field) => typeof quest[field] === 'string' && quest[field].trim().length > 0,
  ) && Array.isArray(quest.steps) && quest.steps.length > 0 && quest.steps.length <= MAX_QUEST_STEPS
    && quest.steps.every((step: unknown) => typeof step === 'string' && step.trim().length > 0)
    && typeof quest.estimatedMinutes === 'number' && Number.isInteger(quest.estimatedMinutes)
    && quest.estimatedMinutes > 0 && typeof quest.estimatedCostDollars === 'number'
    && Number.isFinite(quest.estimatedCostDollars) && quest.estimatedCostDollars >= 0
}

function validProofMethods(
  value: unknown, stepCount: number, allowed: QuestProofMethod[],
): value is QuestProofMethod[] {
  return Array.isArray(value) && value.length === stepCount
    && value.every((method) => allowed.some((option) => option === method))
}

function inferStepDestinationIndexes(stepCount: number, stopCount: number): number[] {
  return stopCount > 1 && stepCount === stopCount
    ? Array.from({ length: stopCount }, (_, index) => index)
    : Array.from({ length: stepCount }, () => 0)
}

function validStepDestinationIndexes(value: unknown, stepCount: number, stopCount: number): value is number[] {
  return Array.isArray(value) && value.length === stepCount
    && value.every((index) => Number.isSafeInteger(index) && index >= 0 && index < stopCount)
    && value.every((index, position) => position === 0 || value[position - 1] <= index)
    && new Set(value).size === stopCount
}

function isSavedQuest(value: unknown, expectedUserId: string): value is SavedQuestResponse {
  if (!isRecord(value) || !isRecord(value.quest) || !isRecord(value.assignment)
      || typeof value.reusedExisting !== 'boolean' || !isQuestContent(value.quest)) return false
  const q = value.quest
  const a = value.assignment
  const savedStopCount = Array.isArray(q.destinations) && q.destinations.length > 0
    ? q.destinations.length : 1
  const savedStepIndexes = q.stepDestinationIndexes
    ?? inferStepDestinationIndexes(q.steps.length, savedStopCount)
  const sourceOrganizationId = q.sourceOrganizationId ?? null
  const sourceOrganizationQuestId = q.sourceOrganizationQuestId ?? null
  return typeof q.id === 'string' && q.id.length > 0 && q.id.length <= 128 && !q.id.includes('/')
    && (sourceOrganizationId === null || typeof sourceOrganizationId === 'string' && sourceOrganizationId.trim().length > 0)
    && (sourceOrganizationQuestId === null || typeof sourceOrganizationQuestId === 'string' && sourceOrganizationQuestId.trim().length > 0)
    && ((sourceOrganizationId === null) === (sourceOrganizationQuestId === null))
    && validStepDestinationIndexes(savedStepIndexes, q.steps.length, savedStopCount)
    && (q.placeId === null || (typeof q.placeId === 'string' && q.placeId.trim().length > 0))
    && q.isActive === true
    && typeof q.latitude === 'number' && Number.isFinite(q.latitude) && Math.abs(q.latitude) <= 90
    && typeof q.longitude === 'number' && Number.isFinite(q.longitude) && Math.abs(q.longitude) <= 180
    && typeof q.radiusMeters === 'number' && Number.isFinite(q.radiusMeters) && q.radiusMeters > 0
    && typeof q.xpReward === 'number' && Number.isSafeInteger(q.xpReward) && q.xpReward >= 0
    && a.userId === expectedUserId && a.questId === q.id && a.id === `${expectedUserId}_${q.id}`
    && (a.replacementCount === undefined || (typeof a.replacementCount === 'number'
      && Number.isInteger(a.replacementCount) && a.replacementCount >= 0 && a.replacementCount <= MAX_QUEST_REPLACEMENTS))
    && a.status === 'assigned' && a.completedAt === null && a.xpAwarded === 0
    && typeof a.assignedAt === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(a.assignedAt)
    && Number.isFinite(Date.parse(a.assignedAt))
}

export class QuestApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    let message = typeof detail === 'string' ? detail : `Quest request failed (HTTP ${status}).`
    if (isRecord(detail) && typeof detail.reason === 'string') message = detail.reason
    if (isRecord(detail) && typeof detail.feedback === 'string') message = detail.feedback
    if (Array.isArray(detail)) {
      const messages = detail.filter(isRecord).slice(0, 3).map((item) => {
        const path = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join('.') : ''
        return typeof item.msg === 'string' ? `${path ? `${path}: ` : ''}${item.msg}` : ''
      }).filter(Boolean)
      if (messages.length) message = messages.join('; ')
    }
    super(message)
    this.name = 'QuestApiError'
    this.status = status
    this.detail = detail
  }
}

// Task 3 only: does not persist a quest or award XP. The frontend team owns
// button/result rendering and can cancel requests on unmount/account switch.
export async function requestTestQuest(
  expectedUserId: string,
  payload: AssignQuestPayload,
  options: QuestRequestOptions = {},
): Promise<QuestPreviewResponse> {
  const result = await requestQuest('/quests/preview', expectedUserId, payload, options)
  if (!isPreview(result)) throw new Error('The backend returned an unexpected quest preview format.')
  return result
}

// Step 4: Gemini preview only. The frontend team owns button/result wiring.
export async function requestGeneratedQuest(
  expectedUserId: string | null,
  payload: GenerateQuestPayload,
  options: QuestRequestOptions = {},
): Promise<GeneratedQuestResponse> {
  const result = await requestQuest('/quests/generate', expectedUserId, payload, options)
  if (!isRecord(result) || result.mode !== 'generated' || typeof result.filtersApplied !== 'boolean'
      || typeof result.destinationVerified !== 'boolean'
      || result.filtersApplied !== result.destinationVerified
      || !isPreview({ ...result, mode: 'test', filtersApplied: false }) || !isRecord(result.quest)) {
    throw new Error('The backend returned an unexpected generated quest format.')
  }
  if (typeof result.quest.locationAddress !== 'string' || !result.quest.locationAddress.trim()) {
    throw new Error('The backend returned an invalid quest destination.')
  }
  const generatedStepCount = Array.isArray(result.quest.steps) ? result.quest.steps.length : 0
  const proofMethods = result.quest.stepProofMethods
    ?? (payload.proofOptions === undefined ? Array(generatedStepCount).fill('location') : undefined)
  if (!validProofMethods(
    proofMethods, generatedStepCount, payload.proofOptions ?? ['location'],
  )) {
    throw new Error('The backend returned invalid per-step proof requirements.')
  }
  const d = result.destination
  let destinations: unknown[] = []
  if (result.destinationVerified) {
    if (!isRecord(d) || typeof d.locationName !== 'string' || !d.locationName.trim()
        || d.scope !== 'gainesville_city'
        || typeof d.latitude !== 'number' || !Number.isFinite(d.latitude) || Math.abs(d.latitude) > 90
        || typeof d.longitude !== 'number' || !Number.isFinite(d.longitude) || Math.abs(d.longitude) > 180
        || !(d.placeId === null || (typeof d.placeId === 'string' && d.placeId.trim().length > 0))) {
      throw new Error('The backend returned an invalid quest destination.')
    }
    destinations = Array.isArray(result.destinations) ? result.destinations : [d]
    const primary = isRecord(destinations[0]) ? destinations[0] : null
    if (!Array.isArray(destinations) || destinations.length < 1 || destinations.length > MAX_QUEST_DESTINATIONS
        || !primary || primary.locationName !== d.locationName || primary.placeId !== d.placeId
        || primary.latitude !== d.latitude || primary.longitude !== d.longitude
        || !destinations.every((stop) => isRecord(stop)
          && typeof stop.locationName === 'string' && stop.locationName.trim().length > 0
          && typeof stop.latitude === 'number' && Number.isFinite(stop.latitude) && Math.abs(stop.latitude) <= 90
          && typeof stop.longitude === 'number' && Number.isFinite(stop.longitude) && Math.abs(stop.longitude) <= 180
          && stop.scope === 'gainesville_city'
          && (stop.placeId === null || (typeof stop.placeId === 'string' && stop.placeId.trim().length > 0)))
        || new Set(destinations.map((stop) => isRecord(stop) ? `${stop.latitude},${stop.longitude}` : '')).size !== destinations.length
        || new Set(destinations.flatMap((stop) => isRecord(stop) && typeof stop.placeId === 'string' ? [stop.placeId] : [])).size
          !== destinations.filter((stop) => isRecord(stop) && typeof stop.placeId === 'string').length
        || (payload.multiQuest === true ? destinations.length < 2 : destinations.length !== 1)) {
      throw new Error('The backend returned an invalid verified destination list.')
    }
  } else if (d !== null) {
    throw new Error('The backend returned inconsistent destination verification.')
  } else if (Array.isArray(result.destinations) && result.destinations.length !== 0) {
    throw new Error('The backend returned inconsistent destination verification.')
  }
  const stopCount = destinations.length || 1
  const stepDestinationIndexes = result.quest.stepDestinationIndexes
    ?? inferStepDestinationIndexes(generatedStepCount, stopCount)
  if (!validStepDestinationIndexes(stepDestinationIndexes, generatedStepCount, stopCount)) {
    throw new Error('The backend returned invalid step-to-destination mapping.')
  }
  const expectedDistanceStatus = payload.distance == null ? 'not_requested'
    : result.destinationVerified ? 'verified' : 'pending'
  if (result.distanceStatus !== expectedDistanceStatus
      || (expectedDistanceStatus === 'verified'
        ? typeof result.distanceMeters !== 'number' || !Number.isFinite(result.distanceMeters) || result.distanceMeters < 0
        : result.distanceMeters !== null)) {
    throw new Error('The backend returned inconsistent distance verification.')
  }
  return {
    ...result,
    quest: {
      ...result.quest,
      stepProofMethods: proofMethods,
      stepDestinationIndexes,
    },
    destinations: Array.isArray(result.destinations)
      ? result.destinations
      : result.destinationVerified && isRecord(d) ? [d] : [],
  } as GeneratedQuestResponse
}

// Save another verified quest, up to three independent active assignments.
export async function requestAssignedQuest(
  expectedUserId: string,
  payload: GenerateQuestPayload,
  options: QuestRequestOptions = {},
): Promise<SavedQuestResponse> {
  const result = await requestQuest('/quests/assign', expectedUserId, payload, options)
  if (!isSavedQuest(result, expectedUserId)) throw new Error('The backend returned an invalid saved assignment.')
  return result
}

export async function getOrganizationQuestBoard(
  options: QuestRequestOptions = {},
): Promise<OrganizationQuestBoardItem[]> {
  const result = await requestQuest('/organization-quests', null, undefined, options, 'GET')
  if (!Array.isArray(result)
      || !result.every(isOrganizationQuestBoardItem)
      || (Array.isArray(result) && new Set(result.map((item) => isRecord(item)
        ? `${item.organizationId}/${item.questId}` : '')).size !== result.length)) {
    throw new Error('The backend returned an invalid organization quest board.')
  }
  return result as OrganizationQuestBoardItem[]
}

export async function requestOrganizationQuest(
  expectedUserId: string,
  organizationId: string,
  questId: string,
  options: QuestRequestOptions = {},
): Promise<SavedQuestResponse> {
  if (!organizationId.trim() || organizationId.includes('/')
      || !questId.trim() || questId.includes('/')) {
    throw new Error('Choose a valid organization quest.')
  }
  const result = await requestQuest(
    `/organization-quests/${encodeURIComponent(organizationId)}/${encodeURIComponent(questId)}/accept`,
    expectedUserId,
    {},
    options,
  )
  if (!isSavedQuest(result, expectedUserId) || result.reusedExisting
      || result.quest.sourceOrganizationId !== organizationId
      || result.quest.sourceOrganizationQuestId !== questId) {
    throw new Error('The backend returned an invalid organization quest assignment.')
  }
  return result
}

// Add another quest while keeping the displayed quest active.
export async function requestAdditionalQuest(
  expectedUserId: string, questId: string, payload: GenerateQuestPayload, options: QuestRequestOptions = {},
): Promise<SavedQuestResponse> {
  if (!questId || questId.includes('/')) throw new Error('Choose a valid current quest.')
  const result = await requestQuest(`/quests/${encodeURIComponent(questId)}/another`, expectedUserId, payload, options)
  if (!isSavedQuest(result, expectedUserId) || result.reusedExisting || result.quest.id === questId) {
    throw new Error('The backend returned an invalid additional assignment.')
  }
  return result
}

// Compatibility for earlier callers; this now adds without replacing.
export const requestReplacementQuest = requestAdditionalQuest

export async function getActiveQuests(
  expectedUserId: string, options: QuestRequestOptions = {},
): Promise<SavedQuestResponse[]> {
  const result = await requestQuest('/me/active-quests', expectedUserId, undefined, options, 'GET')
  if (!Array.isArray(result) || result.length > MAX_ACTIVE_QUESTS
      || !result.every((item) => isSavedQuest(item, expectedUserId))
      || new Set(result.map((item) => item.quest.id)).size !== result.length) {
    throw new Error('The backend returned an invalid active quest list.')
  }
  return result as SavedQuestResponse[]
}

// Reload on page refresh. A successful JSON null means there is no active quest.
export async function getCurrentQuest(
  expectedUserId: string, options: QuestRequestOptions = {},
): Promise<SavedQuestResponse | null> {
  const result = await requestQuest('/me/quest', expectedUserId, undefined, options, 'GET')
  if (result === null) return null
  if (!isSavedQuest(result, expectedUserId)) throw new Error('The backend returned an invalid saved assignment.')
  return result
}

export type CompletionLocation = {
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  stopIndex?: number
}
export type StopCompletionResult = {
  questId: string
  status: 'in_progress' | 'completed'
  stopIndex: number
  xpAwarded: number
  xpAwardedSoFar: number
  completedStops: number[]
  totalStops: number
}

export type PhotoProofResult = {
  accepted: boolean
  feedback: string
  verifiedPhotoSteps?: number[]
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export async function requestPhotoProof(
  userId: string, questId: string, stepIndex: number, image: Blob,
): Promise<PhotoProofResult> {
  if (!questId || questId.includes('/') || !isSafeInteger(stepIndex) || stepIndex < 0) {
    throw new Error('Choose a valid quest step for photo proof.')
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)
      || image.size <= 0 || image.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG, or WebP image up to 5 MB.')
  }
  const result = await requestQuest(
    `/quests/${encodeURIComponent(questId)}/steps/${stepIndex}/photo-proof`, userId, image, {},
  )
  if (!isRecord(result) || typeof result.accepted !== 'boolean'
      || typeof result.feedback !== 'string' || !result.feedback.trim()
      || result.feedback.length > 300) {
    throw new Error('The backend returned an invalid photo review.')
  }
  if (!result.accepted) return { accepted: false, feedback: result.feedback }
  if (!Array.isArray(result.verifiedPhotoSteps)
      || !result.verifiedPhotoSteps.every(isSafeInteger)
      || !result.verifiedPhotoSteps.includes(stepIndex)
      || new Set(result.verifiedPhotoSteps).size !== result.verifiedPhotoSteps.length) {
    throw new Error('The backend returned invalid photo proof progress.')
  }
  return {
    accepted: true,
    feedback: result.feedback,
    verifiedPhotoSteps: result.verifiedPhotoSteps,
  }
}

export async function requestQuestPhotoProofSkip(
  userId: string, questId: string, stepIndex: number,
): Promise<number[]> {
  if (!questId || questId.includes('/') || !isSafeInteger(stepIndex) || stepIndex < 0) {
    throw new Error('Choose a valid quest step for photo proof.')
  }
  const result = await requestQuest(
    `/quests/${encodeURIComponent(questId)}/steps/${stepIndex}/skip-photo-proof`, userId, {}, {},
  )
  if (!isRecord(result) || result.xpAwarded !== 0
      || !Array.isArray(result.skippedPhotoSteps)
      || !result.skippedPhotoSteps.every(isSafeInteger)
      || !result.skippedPhotoSteps.includes(stepIndex)
      || new Set(result.skippedPhotoSteps).size !== result.skippedPhotoSteps.length) {
    throw new Error('The backend returned invalid skipped photo proof progress.')
  }
  return result.skippedPhotoSteps
}

export async function requestQuestCompletion(
  userId: string, questId: string, location: CompletionLocation, stopIndex = 0,
): Promise<StopCompletionResult> {
  if (!questId || questId.includes('/')) throw new Error('Choose a valid sidequest.')
  const result = await requestQuest(
    `/quests/${encodeURIComponent(questId)}/complete`, userId, {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      stopIndex,
    }, {},
  )
  if (!isRecord(result)) {
    throw new Error('The backend returned an invalid completion response.')
  }
  const completedStops = result.completedStops
  if ((result.status !== 'completed' && result.status !== 'in_progress')
      || typeof result.questId !== 'string' || result.questId !== questId
      || !isSafeInteger(result.stopIndex) || result.stopIndex !== stopIndex
      || !isSafeInteger(result.xpAwarded) || result.xpAwarded < 0
      || !isSafeInteger(result.xpAwardedSoFar)
      || !Array.isArray(completedStops) || !completedStops.every(isSafeInteger)
      || !isSafeInteger(result.totalStops) || result.totalStops < 1 || result.totalStops > MAX_QUEST_DESTINATIONS
      || completedStops.length !== stopIndex + 1
      || completedStops[completedStops.length - 1] !== stopIndex
      || (result.status === 'completed') !== (completedStops.length === result.totalStops)) {
    throw new Error('The backend returned an invalid completion response.')
  }
  return {
    questId: result.questId,
    status: result.status,
    stopIndex: result.stopIndex,
    xpAwarded: result.xpAwarded,
    xpAwardedSoFar: result.xpAwardedSoFar,
    completedStops,
    totalStops: result.totalStops,
  }
}

export async function requestQuestAbandon(userId: string, questId: string): Promise<void> {
  if (!questId || questId.includes('/')) throw new Error('Choose a valid sidequest.')
  const result = await requestQuest(`/quests/${encodeURIComponent(questId)}/abandon`, userId, undefined, {})
  if (!isRecord(result) || result.status !== 'abandoned' || result.questId !== questId) {
    throw new Error('The backend returned an invalid abandon response.')
  }
}

async function requestQuest(
  path: string, expectedUserId: string | null,
  payload: AssignQuestPayload | CompletionLocation | Blob | Record<string, unknown> | undefined,
  options: QuestRequestOptions, method: 'POST' | 'GET' = 'POST',
): Promise<unknown> {
  const started = now()
  const idToken = expectedUserId === null ? null : await getFirebaseIdToken(expectedUserId)
  const tokenReady = now()
  let response: Response
  try {
    const isImage = typeof Blob !== 'undefined' && payload instanceof Blob
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: {
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        ...(method === 'POST' ? { 'Content-Type': isImage ? payload.type : 'application/json' } : {}),
      },
      credentials: 'omit',
      body: payload === undefined ? undefined : isImage ? payload : JSON.stringify(payload),
      signal: options.signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error('Could not connect right now. Please try again in a moment.')
  }
  let result: unknown
  try {
    result = await response.json()
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error('Something went wrong while loading your quest. Please try again.')
  }
  const finished = now()
  try {
    options.onTiming?.({
      tokenMs: tokenReady - started,
      requestMs: finished - tokenReady,
      totalMs: finished - started,
      serverTiming: response.headers?.get('Server-Timing') ?? null,
    })
  } catch {
    // A diagnostic callback must not change the result of a quest request.
  }
  if (!response.ok) throw new QuestApiError(response.status, isRecord(result) ? result.detail : undefined)
  return result
}
