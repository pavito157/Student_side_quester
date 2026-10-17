import type {
  BudgetConstraint,
  DistanceConstraint,
  SidequestRequestInput,
  SidequestRequestPayload,
  TimeConstraint,
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
    (!Number.isFinite(distance.maxDistance) || distance.maxDistance < 0)
  ) {
    throw new Error('Maximum distance must be a non-negative number of miles.')
  }
}

export function buildSidequestRequest(
  input: SidequestRequestInput,
): SidequestRequestPayload {
  validateTime(input.time)
  validateBudget(input.budget)
  validateDistance(input.distance)

  const username = input.username.trim()
  if (!username) throw new Error('A username is required to build the sidequest request.')
  if (!input.goals.every((goal) => typeof goal === 'string')) {
    throw new Error('Goals must be plain text values.')
  }

  return {
    preferences: input.preferences.trim(),
    username,
    location: input.location.trim() || 'Not selected',
    time: { ...input.time },
    budget: { ...input.budget },
    distance: input.distance ? { ...input.distance } : null,
    goals: input.goals.map((goal) => goal.trim()).filter(Boolean),
    vibePreferences: input.vibePreferences?.trim() || null,
  }
}

export function serializeSidequestRequest(payload: SidequestRequestPayload): string {
  return JSON.stringify(payload, null, 2)
}
