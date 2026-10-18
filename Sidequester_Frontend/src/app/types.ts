import type { ActiveSidequest } from '../types/sidequest'

export type ActiveSidequestsState = {
  userId: string | null
  sidequests: ActiveSidequest[]
  isLoading: boolean
  error: string
}
