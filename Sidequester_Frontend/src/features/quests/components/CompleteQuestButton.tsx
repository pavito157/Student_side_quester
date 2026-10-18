import { useRef, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { completeQuest } from '../../../services/questApi'

type Props = {
  // The Firestore child document ID / response.quest.id.
  assignedQuestId: string
  stopIndex?: number
}

export default function CompleteQuestButton(props: Props) {
  const { user } = useUser()
  // Remount account/quest-specific feedback when either identity changes.
  return <CompletionControl key={`${user?.id ?? ''}:${props.assignedQuestId}:${props.stopIndex ?? 0}`} {...props} userId={user?.id} />
}

function CompletionControl({ assignedQuestId, userId, stopIndex = 0 }: Props & { userId?: string }) {
  const [pending, setPending] = useState(false)
  const [hasCompleted, setHasCompleted] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const completed = useRef(false)

  async function handleClick() {
    if (inFlight.current || completed.current) return
    if (!userId) { setError('Sign in to complete a sidequest.'); return }
    inFlight.current = true
    setPending(true)
    setMessage('')
    setError('')
    try {
      const result = await completeQuest(userId, assignedQuestId, stopIndex)
      completed.current = true
      setHasCompleted(true)
      setMessage(result.status === 'completed'
        ? `Sidequest completed. You earned ${result.xpAwarded} XP.`
        : `Stop ${stopIndex + 1} completed. You earned ${result.xpAwarded} XP. Open quest details for the next stop.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete quest.')
      return
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return <div>
    <button type="button" disabled={pending || hasCompleted || !userId} onClick={() => void handleClick()}>
      {pending ? 'Verifying location…' : hasCompleted ? 'Completed' : 'Complete quest'}
    </button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
