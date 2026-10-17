const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type CompleteQuestResult = {
  status: 'completed' | 'already_completed'
  xp_awarded: number
}

export async function completeQuest(
  assignedQuestId: string,
  token: string,
): Promise<CompleteQuestResult> {
  const response = await fetch(
    `${API_URL}/quests/${encodeURIComponent(assignedQuestId)}/complete`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail ?? 'Could not complete quest')
  }
  return response.json()
}