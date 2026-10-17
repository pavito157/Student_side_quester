import { useEffect, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import { navigateTo } from '../../services/navigation'
import { subscribeToActiveSidequests } from '../../services/sidequests'
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

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return
    return subscribeToActiveSidequests(
      userId,
      (sidequests) => setState({ userId, sidequests, isLoading: false, error: '' }),
      (error) => setState({ userId, sidequests: [], isLoading: false, error }),
    )
  }, [isLoaded, isSignedIn, userId])

  if (!isLoaded) {
    return <p role="status" className="text-sm" style={{ color: colors.muted }}>Loading account…</p>
  }

  return (
    <section aria-labelledby="active-sidequests-heading" className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3
          id="active-sidequests-heading"
          className="text-sm font-bold uppercase tracking-wide"
          style={{ color: colors.secondary }}
        >
          Active sidequests
        </h3>
        {state.userId === userId && state.sidequests.length > 0 && (
          <span className="rounded-full px-2 py-0.5 text-xs" style={{
            color: colors.foreground,
            backgroundColor: colors.surfaceRaised,
          }}>
            {state.sidequests.length}
          </span>
        )}
      </div>

      {!isSignedIn || !userId ? (
        <p className="text-sm leading-relaxed" style={{ color: colors.muted }}>
          Sign in to see your active sidequests.
        </p>
      ) : state.userId !== userId || state.isLoading ? (
        <p role="status" className="text-sm" style={{ color: colors.muted }}>
          Loading active sidequests…
        </p>
      ) : state.error ? (
        <p role="alert" className="text-sm" style={{ color: colors.error }}>
          Could not load active sidequests: {state.error}
        </p>
      ) : state.sidequests.length === 0 ? (
        <p className="text-sm leading-relaxed" style={{ color: colors.muted }}>
          No active sidequests yet. Saved requests will appear here for three days.
        </p>
      ) : (
        <ul className="space-y-2">
          {state.sidequests.map((sidequest) => (
            <li key={sidequest.id}>
              <button
                type="button"
                onClick={() => navigateTo(`/sidequests/${encodeURIComponent(sidequest.id)}`)}
                className="quest-subpanel w-full cursor-pointer rounded-xl p-3 text-left transition hover:-translate-y-0.5 hover:border-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ outlineColor: colors.secondary }}
              >
                <span className="block truncate text-sm font-semibold">
                  {sidequest.request.location === 'Anywhere' ||
                  sidequest.request.location === 'Not selected'
                    ? 'Sidequest'
                    : sidequest.request.location}
                </span>
                <span className="mt-1 flex justify-between gap-2 text-xs" style={{ color: colors.muted }}>
                  <span>
                    Expires {new Date(sidequest.expiresAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="shrink-0">+{sidequest.xpValue} XP</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default ActiveSidequests
