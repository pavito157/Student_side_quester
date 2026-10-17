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
  request: SidequestRequestPayload
  xpValue: number
  createdAt: string
  expiresAt: string
}
