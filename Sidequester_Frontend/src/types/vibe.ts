export type Vibe = {
  id: string
  name: string
  preferences: string
  where: string
  time: string
  budget: string
  distance: string
  customTime?: string
  customBudget?: string
  customDistance?: string
  createdAt?: string
  updatedAt?: string
}

export type VibeInput = Omit<Vibe, 'id' | 'createdAt' | 'updatedAt'>
