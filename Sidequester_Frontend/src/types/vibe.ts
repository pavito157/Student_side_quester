export type Vibe = {
  id: string
  name: string
  preferences: string
  where: string
  time: string
  budget: string
  customTime?: string
  customBudget?: string
  createdAt?: string
  updatedAt?: string
}

export type VibeInput = Omit<Vibe, 'id' | 'createdAt' | 'updatedAt'>
