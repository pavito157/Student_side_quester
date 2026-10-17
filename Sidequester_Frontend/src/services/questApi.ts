import { completeSidequest } from './sidequests'

export type CompleteQuestResult = {
  status: 'completed'
  xpAwarded: number
}

// Compatibility helper for the teammate's reusable button. The existing service
// obtains fresh GPS, exchanges no Clerk token here, and authenticates with the
// same Firebase ID-token helper and VITE_API_BASE_URL as every other quest call.
export async function completeQuest(
  expectedUserId: string,
  questId: string,
): Promise<CompleteQuestResult> {
  const xpAwarded = await completeSidequest(expectedUserId, questId)
  return { status: 'completed', xpAwarded }
}
