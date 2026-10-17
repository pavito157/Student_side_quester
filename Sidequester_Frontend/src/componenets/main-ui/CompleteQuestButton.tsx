import { useRef, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { completeQuest } from '../../services/questApi'

type Props = {
  // The Firestore child document ID / response.quest.id.
  assignedQuestId: string
}

export default function CompleteQuestButton(props: Props) {
  const { user } = useUser()
  // Remount account/quest-specific feedback when either identity changes.
  return <CompletionControl key={`${user?.id ?? ''}:${props.assignedQuestId}`} {...props} userId={user?.id} />
}

function CompletionControl({ assignedQuestId, userId }: Props & { userId?: string }) {
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
      const result = await completeQuest(userId, assignedQuestId)
      completed.current = true
      setHasCompleted(true)
      setMessage(`Sidequest completed. You earned ${result.xpAwarded} XP.`)
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
