import { useEffect, useState } from 'react'
import { colors } from '../../constants/colors'
import { getFirebaseIdToken } from '../../services/firebaseSession'
import { getDormProfile, saveDormSelection, type DormProfile } from '../../services/dorms'
import DormPicker from './DormPicker'

type DormSettingsProps = {
  userId: string
}

function DormSettings({ userId }: DormSettingsProps) {
  const [profile, setProfile] = useState<DormProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    let isCurrent = true

    async function loadDorm() {
      try {
        const token = await getFirebaseIdToken(userId)
        const result = await getDormProfile(token)
        if (isCurrent) setProfile(result)
      } catch (error) {
        if (isCurrent) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load residence.')
        }
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    void loadDorm()
    return () => {
      isCurrent = false
    }
  }, [userId])

  async function handleSave(dormId: string) {
    setIsSaving(true)
    setErrorMessage('')
    setSavedMessage('')
    try {
      const token = await getFirebaseIdToken(userId)
      const updated = await saveDormSelection(token, dormId)
      setProfile(updated)
      setSavedMessage(`Residence saved: ${updated.dormName}.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save residence.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <p role="status" style={{ color: colors.muted }}>Loading residences…</p>
  }
  if (!profile) {
    return (
      <p role="alert" style={{ color: colors.error }}>
        {errorMessage || 'Could not load your residence.'}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed" style={{ color: colors.muted }}>
        Choose the UF residence hall to associate with your XP. Your current selection
        is {profile.dormName ?? 'not set'}.
      </p>
      <DormPicker
        key={profile.dormId ?? 'unset'}
        dorms={profile.dorms}
        selectedDormId={profile.dormId}
        isSaving={isSaving}
        errorMessage={errorMessage}
        onSave={(dormId) => void handleSave(dormId)}
      />
      {savedMessage && (
        <p role="status" className="text-sm" style={{ color: colors.success }}>
          {savedMessage}
        </p>
      )}
    </div>
  )
}

export default DormSettings
