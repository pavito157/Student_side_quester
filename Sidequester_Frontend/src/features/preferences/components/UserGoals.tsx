import { useUser } from '@clerk/clerk-react'
import { colors } from '../../../constants/colors'
import GoalsEditor from './GoalsEditor'

interface UserGoalsProps {
  idPrefix: string
  compact?: boolean
}

function UserGoals({ idPrefix, compact }: UserGoalsProps) {
  const { user, isLoaded } = useUser()

  if (!isLoaded || !user) {
    return <p className="text-sm" style={{ color: colors.muted }}>Loading account…</p>
  }

  return <GoalsEditor compact={compact} idPrefix={idPrefix} userId={user.id} />
}

export default UserGoals
