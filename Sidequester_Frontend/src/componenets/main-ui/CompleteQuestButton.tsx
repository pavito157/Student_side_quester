import { useAuth } from '@clerk/clerk-react'
import { completeQuest } from '../../services/questApi'

export default function CompleteQuestButton({ assignedQuestId }: { assignedQuestId: string }) {
  const { getToken } = useAuth()

  async function handleClick() {
    const token = await getToken()
    if (!token) return // not signed in
    try {
      const result = await completeQuest(assignedQuestId, token)
      alert(result.status === 'completed' ? `+${result.xp_awarded} XP!` : 'Already completed')
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return <button onClick={handleClick}>Complete quest</button>
}