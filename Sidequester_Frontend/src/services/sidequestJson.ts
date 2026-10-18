import type { GenerateQuestPayload } from './questAssignment'
import type {
  BudgetConstraint,
  DistanceConstraint,
  SidequestRequestInput,
  SidequestRequestPayload,
  TimeConstraint,
  QuestProofMethod,
} from '../types/sidequest'

function validateTime(time: TimeConstraint): void {
  if (!['any', '30', '60', '120', 'custom'].includes(time.selection)) {
    throw new Error('Choose a valid time constraint.')
  }

  if (
    time.selection === 'custom' &&
    (!Number.isSafeInteger(time.customMinutes) || (time.customMinutes ?? 0) <= 0)
  ) {
    throw new Error('Custom time must be a whole number of minutes greater than zero.')
  }

  if (time.selection !== 'custom' && time.customMinutes !== null) {
    throw new Error('Custom minutes can only be provided with a custom time constraint.')
  }
}

function validateBudget(budget: BudgetConstraint): void {
  if (!['any', '0', '10', '10-25', 'custom'].includes(budget.selection)) {
    throw new Error('Choose a valid budget constraint.')
  }

  if (
    budget.selection === 'custom' &&
    (budget.customDollars === null ||
      !Number.isFinite(budget.customDollars) ||
      budget.customDollars < 0)
  ) {
    throw new Error('Custom budget must be a non-negative dollar amount.')
  }

  if (budget.selection !== 'custom' && budget.customDollars !== null) {
    throw new Error('Custom dollars can only be provided with a custom budget constraint.')
  }
}

function validateDistance(distance: DistanceConstraint): void {
  if (
    distance !== null &&
    (distance.unit !== 'miles' || !Number.isFinite(distance.maxDistance) || distance.maxDistance <= 0)
  ) {
    throw new Error('Maximum distance must be a positive number of miles.')
  }
}

function validateCoordinates(latitude: number | null, longitude: number | null): void {
  if (latitude === null && longitude === null) return
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('Location coordinates must include a valid latitude and longitude.')
  }
}

export function buildSidequestRequest(
  input: SidequestRequestInput,
): SidequestRequestPayload {
  validateTime(input.time)
  validateBudget(input.budget)
  validateDistance(input.distance)
  validateCoordinates(input.latitude, input.longitude)

  const origin = input.originCoordinates
  if (origin && (!Number.isFinite(origin.latitude) || Math.abs(origin.latitude) > 90 ||
    !Number.isFinite(origin.longitude) || Math.abs(origin.longitude) > 180)) {
    throw new Error('Choose a location with valid coordinates.')
  }
  if (input.distance !== null && !origin) {
    throw new Error('Select a starting place or use your location to apply a distance limit.')
  }
  if (origin && ['', 'any', 'anywhere', 'not selected'].includes(input.location.trim().toLowerCase())) {
    throw new Error('Choose a starting place for these coordinates.')
  }
  if (input.multiQuest === true && !origin) {
    throw new Error('Choose a starting location to create a multi-stop sidequest.')
  }

  const username = input.username.trim()
  if (!username) throw new Error('A username is required to build the sidequest request.')
  if (!input.goals.every((goal) => typeof goal === 'string')) {
    throw new Error('Goals must be plain text values.')
  }
  const proofMethods: QuestProofMethod[] = ['location', 'photo', 'recreation']
  const proofOptions = input.proofOptions ?? ['location']
  if (!proofOptions.length
      || proofOptions.some((method) => !proofMethods.includes(method))
      || new Set(proofOptions).size !== proofOptions.length
      || proofOptions.includes('recreation') && proofOptions.length > 1) {
    throw new Error('Choose one or more valid quest proof options.')
  }

  return {
    preferences: input.preferences.trim(),
    username,
    ...(origin ? { originCoordinates: { ...origin } } : {}),
    location: input.location.trim() || 'Not selected',
    latitude: input.latitude,
    longitude: input.longitude,
    time: { ...input.time },
    budget: { ...input.budget },
    distance: input.distance ? { ...input.distance } : null,
    goals: input.goals.map((goal) => goal.trim()).filter(Boolean),
    vibePreferences: input.vibePreferences?.trim() || null,
    multiQuest: input.multiQuest === true,
    ...(input.proofOptions ? { proofOptions: [...proofOptions] } : {}),
  }
}

export function serializeSidequestRequest(payload: SidequestRequestPayload): string {
  return JSON.stringify(payload, null, 2)
}


// Frontend history/maps retain flat coordinates. FastAPI receives its own exact
// contract, with coordinates only under originCoordinates (never duplicated).
export function toQuestApiPayload(request: SidequestRequestPayload): GenerateQuestPayload {
  return {
    preferences: request.preferences,
    username: request.username,
    location: request.location,
    ...(request.originCoordinates ? { originCoordinates: { ...request.originCoordinates } } : {}),
    time: request.time.selection === 'custom'
      ? { selection: request.time.selection, customMinutes: request.time.customMinutes }
      : { selection: request.time.selection },
    budget: { ...request.budget },
    distance: request.distance ? { ...request.distance } : null,
    goals: [...request.goals],
    vibePreferences: request.vibePreferences,
    multiQuest: request.multiQuest,
    ...(request.proofOptions ? { proofOptions: [...request.proofOptions] } : {}),
  }
}
