import { useEffect, useState, type ReactNode } from 'react'
import { useUser } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import { getFirebaseIdToken } from '../../services/firebaseSession'
import { getDormProfile, saveDormSelection, type DormProfile } from '../../services/dorms'
import Header from '../../components/navigation/Header'
import DormPicker from '../settings/DormPicker'

type DormGateState = {
  userId: string
  profile: DormProfile | null
  error: string
}

type DormSelectionGateProps = {
  children: ReactNode
}

function DormSelectionGate({ children }: DormSelectionGateProps) {
  const { isLoaded, isSignedIn, user } = useUser()
  const userId = user?.id ?? ''
  const [attempt, setAttempt] = useState(0)
  const [gateState, setGateState] = useState<DormGateState | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const stateIsCurrent = gateState?.userId === userId

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return
    let isCurrent = true

    async function loadProfile() {
      try {
        const token = await getFirebaseIdToken(userId)
        const profile = await getDormProfile(token)
        if (isCurrent) setGateState({ userId, profile, error: '' })
      } catch (error) {
        if (isCurrent) {
          setGateState({
            userId,
            profile: null,
            error: error instanceof Error ? error.message : 'Could not load your residence.',
          })
        }
      }
    }

    void loadProfile()
    return () => {
      isCurrent = false
    }
  }, [attempt, isLoaded, isSignedIn, userId])

  async function handleSave(dormId: string) {
    setIsSaving(true)
    setSaveError('')
    try {
      const token = await getFirebaseIdToken(userId)
      const profile = await saveDormSelection(token, dormId)
      setGateState({ userId, profile, error: '' })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save your residence.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isLoaded) {
    return <p role="status" className="p-6" style={{ color: colors.muted }}>Checking sign-in status…</p>
  }
  if (!isSignedIn) return children
  if (!stateIsCurrent) {
    return <p role="status" className="p-6" style={{ color: colors.muted }}>Loading your profile…</p>
  }
  if (gateState.error) {
    return (
      <main className="min-h-[100dvh] bg-gradient-glow px-4 py-10">
        <section className="rpg-panel mx-auto max-w-xl space-y-4 p-6 sm:p-8">
          <h1 className="text-2xl font-bold">Could not load your residence</h1>
          <p role="alert" className="text-sm" style={{ color: colors.error }}>{gateState.error}</p>
          <button
            type="button"
            onClick={() => setAttempt((current) => current + 1)}
            className="rounded-xl px-4 py-2 font-semibold"
            style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
          >
            Retry
          </button>
        </section>
      </main>
    )
  }
  if (!gateState.profile) {
    return <p role="status" className="p-6" style={{ color: colors.muted }}>Loading your profile…</p>
  }
  if (gateState.profile.dormId) return children

  return (
    <>
      <Header title="Choose your residence" />
      <main className="min-h-[calc(100dvh-4rem)] bg-gradient-glow px-4 py-10 sm:py-16">
        <section className="rpg-panel mx-auto max-w-xl space-y-4 p-6 sm:p-8">
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: colors.secondary }}
          >
            One-time profile setup
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl">Where do you live?</h1>
          <p className="text-sm leading-relaxed" style={{ color: colors.muted }}>
            Choose your residence so earned XP can be counted on the UF dorm leaderboard.
          </p>
          <DormPicker
            dorms={gateState.profile.dorms}
            selectedDormId={null}
            isSaving={isSaving}
            errorMessage={saveError}
            onSave={(dormId) => void handleSave(dormId)}
            submitLabel="Continue"
          />
        </section>
      </main>
    </>
  )
}

export default DormSelectionGate
