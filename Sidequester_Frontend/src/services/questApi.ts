import { completeSidequest } from './sidequests'

export type CompleteQuestResult = {
  status: 'completed' | 'in_progress'
  xpAwarded: number
}

// Compatibility helper for the teammate's reusable button. The existing service
// obtains fresh GPS, exchanges no Clerk token here, and authenticates with the
// same Firebase ID-token helper and VITE_API_BASE_URL as every other quest call.
export async function completeQuest(
  expectedUserId: string,
  questId: string,
  stopIndex = 0,
): Promise<CompleteQuestResult> {
  const result = await completeSidequest(expectedUserId, questId, stopIndex)
  return { status: result.status, xpAwarded: result.xpAwarded }
}
