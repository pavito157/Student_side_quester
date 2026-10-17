export type OriginCoordinates = { latitude: number; longitude: number }

export type TimeConstraint = {
  selection: 'any' | '30' | '60' | '120' | 'custom'
  customMinutes: number | null
}

export type BudgetConstraint = {
  selection: 'any' | '0' | '10' | '10-25' | 'custom'
  customDollars: number | null
}

export type DistanceConstraint = {
  maxDistance: number
  unit: 'miles'
} | null

export type SidequestRequestInput = {
  preferences: string
  username: string
  location: string
  originCoordinates?: OriginCoordinates | null
  latitude: number | null
  longitude: number | null
  time: TimeConstraint
  budget: BudgetConstraint
  distance: DistanceConstraint
  goals: string[]
  vibePreferences?: string | null
  multiQuest?: boolean
}

export type SidequestRequestPayload = {
  preferences: string
  username: string
  location: string
  originCoordinates?: OriginCoordinates | null
  latitude: number | null
  longitude: number | null
  time: TimeConstraint
  budget: BudgetConstraint
  distance: DistanceConstraint
  goals: string[]
  vibePreferences: string | null
  multiQuest: boolean
}

export type SavedSidequestRequest = {
  id: string
  request: SidequestRequestPayload
  createdAt: string
  isActive: boolean
  xpValue: number
}

export type ActiveSidequest = {
  id: string
  title: string
  description: string
  steps: string[]
  locationName: string
  placeId?: string | null
  destinations?: Array<{
    locationName: string
    placeId?: string | null
    latitude: number
    longitude: number
  }>
  completedStops?: number[]
  latitude: number
  longitude: number
  estimatedMinutes: number
  estimatedCostDollars: number
  xpValue: number
  createdAt: string
  userRequest?: Record<string, unknown> | null
}
