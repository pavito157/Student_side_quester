import { getFirebaseIdToken } from './firebaseSession'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

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

type QuestPayloadWithLegacyCoordinates = GenerateQuestPayload & {
  latitude?: number | null
  longitude?: number | null
}

export function toQuestApiPayload(payload: QuestPayloadWithLegacyCoordinates): GenerateQuestPayload {
  return {
    location: payload.location,
    time: payload.time,
    budget: payload.budget,
    preferences: payload.preferences,
    username: payload.username,
    distance: payload.distance,
    goals: payload.goals,
    vibePreferences: payload.vibePreferences,
    originCoordinates: payload.originCoordinates,
  }
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

const now = () => typeof performance === 'undefined' ? Date.now() : performance.now()

export type GeneratedQuestResponse = Omit<QuestPreviewResponse, 'mode' | 'filtersApplied' | 'quest'> & {
  mode: 'generated'
  filtersApplied: boolean
  destinationVerified: boolean
  distanceStatus: 'not_requested' | 'pending' | 'verified'
  distanceMeters: number | null
  quest: QuestPreviewResponse['quest'] & {
    locationAddress: string
  }
  destination: {
    locationName: string
    latitude: number
    longitude: number
    placeId: string | null
    scope: 'gainesville_city'
  } | null
}

export type SavedQuestResponse = {
  quest: QuestPreviewResponse['quest'] & {
    id: string
    placeId: string | null
    latitude: number
    longitude: number
    radiusMeters: number
    xpReward: number
    isActive: true
  }
  assignment: {
    id: string
    userId: string
    questId: string
    status: 'assigned'
    assignedAt: string
    completedAt: null
    xpAwarded: 0
  }
  reusedExisting: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  ) && Array.isArray(quest.steps) && quest.steps.length > 0
    && quest.steps.every((step: unknown) => typeof step === 'string' && step.trim().length > 0)
    && typeof quest.estimatedMinutes === 'number' && Number.isInteger(quest.estimatedMinutes)
    && quest.estimatedMinutes > 0 && typeof quest.estimatedCostDollars === 'number'
    && Number.isFinite(quest.estimatedCostDollars) && quest.estimatedCostDollars >= 0
}

function isSavedQuest(value: unknown, expectedUserId: string): value is SavedQuestResponse {
  if (!isRecord(value) || !isRecord(value.quest) || !isRecord(value.assignment)
      || typeof value.reusedExisting !== 'boolean' || !isQuestContent(value.quest)) return false
  const q = value.quest
  const a = value.assignment
  return typeof q.id === 'string' && q.id.length > 0 && q.id.length <= 128 && !q.id.includes('/')
    && (q.placeId === null || (typeof q.placeId === 'string' && q.placeId.trim().length > 0))
    && q.isActive === true
    && typeof q.latitude === 'number' && Number.isFinite(q.latitude) && Math.abs(q.latitude) <= 90
    && typeof q.longitude === 'number' && Number.isFinite(q.longitude) && Math.abs(q.longitude) <= 180
    && typeof q.radiusMeters === 'number' && Number.isFinite(q.radiusMeters) && q.radiusMeters > 0
    && typeof q.xpReward === 'number' && Number.isSafeInteger(q.xpReward) && q.xpReward >= 0
    && a.userId === expectedUserId && a.questId === q.id && a.id === `${expectedUserId}_${q.id}`
    && a.status === 'assigned' && a.completedAt === null && a.xpAwarded === 0
    && typeof a.assignedAt === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(a.assignedAt)
    && Number.isFinite(Date.parse(a.assignedAt))
}

export class QuestApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    let message = typeof detail === 'string' ? detail : `Quest request failed (HTTP ${status}).`
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
  expectedUserId: string,
  payload: QuestPayloadWithLegacyCoordinates,
  options: QuestRequestOptions = {},
): Promise<GeneratedQuestResponse> {
  const apiPayload = toQuestApiPayload(payload)
  const result = await requestQuest('/quests/generate', expectedUserId, apiPayload, options)
  if (!isRecord(result) || result.mode !== 'generated' || typeof result.filtersApplied !== 'boolean'
      || typeof result.destinationVerified !== 'boolean'
      || result.filtersApplied !== result.destinationVerified
      || !isPreview({ ...result, mode: 'test', filtersApplied: false }) || !isRecord(result.quest)) {
    throw new Error('The backend returned an unexpected generated quest format.')
  }
  if (typeof result.quest.locationAddress !== 'string' || !result.quest.locationAddress.trim()) {
    throw new Error('The backend returned an invalid quest destination.')
  }
  const d = result.destination
  if (result.destinationVerified) {
    if (!isRecord(d) || typeof d.locationName !== 'string' || !d.locationName.trim()
        || d.scope !== 'gainesville_city'
        || typeof d.latitude !== 'number' || !Number.isFinite(d.latitude) || Math.abs(d.latitude) > 90
        || typeof d.longitude !== 'number' || !Number.isFinite(d.longitude) || Math.abs(d.longitude) > 180
        || !(d.placeId === null || (typeof d.placeId === 'string' && d.placeId.trim().length > 0))) {
      throw new Error('The backend returned an invalid quest destination.')
    }
  } else if (d !== null) {
    throw new Error('The backend returned inconsistent destination verification.')
  }
  const expectedDistanceStatus = payload.distance == null ? 'not_requested'
    : result.destinationVerified ? 'verified' : 'pending'
  if (result.distanceStatus !== expectedDistanceStatus
      || (expectedDistanceStatus === 'verified'
        ? typeof result.distanceMeters !== 'number' || !Number.isFinite(result.distanceMeters) || result.distanceMeters < 0
        : result.distanceMeters !== null)) {
    throw new Error('The backend returned inconsistent distance verification.')
  }
  return result as GeneratedQuestResponse
}

// Step 5: save a verified quest, or reuse the student's existing active assignment.
export async function requestAssignedQuest(
  expectedUserId: string,
  payload: QuestPayloadWithLegacyCoordinates,
  options: QuestRequestOptions = {},
): Promise<SavedQuestResponse> {
  const apiPayload = toQuestApiPayload(payload)
  const result = await requestQuest('/quests/assign', expectedUserId, apiPayload, options)
  if (!isSavedQuest(result, expectedUserId)) throw new Error('The backend returned an invalid saved assignment.')
  return result
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

async function requestQuest(
  path: string, expectedUserId: string, payload: AssignQuestPayload | undefined,
  options: QuestRequestOptions, method: 'POST' | 'GET' = 'POST',
): Promise<unknown> {
  const started = now()
  const idToken = await getFirebaseIdToken(expectedUserId)
  const tokenReady = now()
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${idToken}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      credentials: 'omit',
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: options.signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error('Could not reach FastAPI. Check the backend server, VITE_API_BASE_URL, and allowed frontend origin.')
  }
  let result: unknown
  try {
    result = await response.json()
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error(`FastAPI returned a non-JSON response (HTTP ${response.status}). Check VITE_API_BASE_URL.`)
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
