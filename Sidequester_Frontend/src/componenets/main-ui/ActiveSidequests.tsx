import { useEffect, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import {
  completeSidequest,
  subscribeToActiveSidequests,
} from '../../services/sidequests'
import type { ActiveSidequest as ActiveSidequestRecord } from '../../types/sidequest'

type ActiveSidequestsState = {
  userId: string | null
  sidequests: ActiveSidequestRecord[]
  isLoading: boolean
  error: string
}

function ActiveSidequests() {
  const { isLoaded, isSignedIn, user } = useUser()
  const userId = user?.id
  const [state, setState] = useState<ActiveSidequestsState>({
    userId: null,
    sidequests: [],
    isLoading: true,
    error: '',
  })
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completionMessage, setCompletionMessage] = useState('')
  const [completionError, setCompletionError] = useState('')

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return
    return subscribeToActiveSidequests(
      userId,
      (sidequests) => setState({ userId, sidequests, isLoading: false, error: '' }),
      (error) => setState({ userId, sidequests: [], isLoading: false, error }),
    )
  }, [isLoaded, isSignedIn, userId])

  async function handleComplete(sidequestId: string) {
    if (!user) return
    setCompletingId(sidequestId)
    setCompletionMessage('')
    setCompletionError('')

    try {
      const awardedXp = await completeSidequest(user.id, sidequestId)
      setCompletionMessage(
        awardedXp > 0
          ? `Sidequest completed. +${awardedXp} XP`
          : 'This sidequest was already completed.',
      )
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : 'Could not complete this sidequest.',
      )
    } finally {
      setCompletingId(null)
    }
  }

  if (!isLoaded || !isSignedIn || !user) return null
  if (state.userId !== user.id) {
    return (
      <section className="rpg-panel mx-auto mt-8 w-full max-w-5xl p-5 sm:p-6" aria-busy="true">
        <p className="text-sm" style={{ color: colors.muted }}>Loading active sidequests…</p>
      </section>
    )
  }
  if (!state.isLoading && !state.error && state.sidequests.length === 0) return null

  return (
    <section
      aria-labelledby="active-sidequests-heading"
      className="rpg-panel mx-auto mt-8 w-full max-w-5xl p-5 sm:p-6"
    >
      <div className="mb-4">
        <p
          className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: colors.secondary }}
        >
          Your saved requests
        </p>
        <h2 id="active-sidequests-heading" className="mt-1 text-xl font-black sm:text-2xl">
          Active sidequests
        </h2>
      </div>

      {state.isLoading ? (
        <p role="status" className="text-sm" style={{ color: colors.muted }}>
          Loading active sidequests…
        </p>
      ) : state.error ? (
        <p role="alert" className="text-sm" style={{ color: colors.error }}>
          Could not load active sidequests: {state.error}
        </p>
      ) : (
        <ul className="space-y-3">
          {state.sidequests.map((sidequest) => (
            <li
              key={sidequest.id}
              className="quest-subpanel flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {sidequest.location === 'Anywhere' || sidequest.location === 'Not selected'
                    ? 'Sidequest'
                    : sidequest.location}
                </p>
                <p className="mt-1 text-sm" style={{ color: colors.muted }}>
                  +{sidequest.xpValue} XP on completion
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleComplete(sidequest.id)}
                disabled={completingId !== null}
                className="min-h-10 shrink-0 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  backgroundColor: colors.primary,
                  color: colors.primaryForeground,
                  outlineColor: colors.primary,
                }}
              >
                {completingId === sidequest.id ? 'Completing…' : 'Complete'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {completionMessage && (
        <p role="status" className="mt-4 text-sm" style={{ color: colors.success }}>
          {completionMessage}
        </p>
      )}
      {completionError && (
        <p role="alert" className="mt-4 text-sm" style={{ color: colors.error }}>
          {completionError}
        </p>
      )}
    </section>
  )
}

export default ActiveSidequests
