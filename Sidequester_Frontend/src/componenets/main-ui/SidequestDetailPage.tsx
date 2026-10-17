import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useUser } from '@clerk/clerk-react'
import Header from './Header'
import SidequestMap from './SidequestMap'
import { colors } from '../../constants/colors'
import { navigateTo } from '../../services/navigation'
import { abandonSidequest, completeSidequest, subscribeToActiveSidequest } from '../../services/sidequests'
import type { ActiveSidequest } from '../../types/sidequest'
import { MAX_ACTIVE_QUESTS } from '../../services/questAssignment'

type SidequestState =
  | { key: string; status: 'loading' }
  | { key: string; status: 'error'; message: string }
  | { key: string; status: 'ready'; sidequest: ActiveSidequest }
  | { key: string; status: 'not-found' }

function formatDate(date: string): string {
  return new Date(date).toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b py-3 last:border-b-0" style={{ borderColor: colors.border }}>
      <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.muted }}>
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{children}</dd>
    </div>
  )
}

function SidequestDetailPage({
  sidequestId,
  generationState,
  onGenerateAnother,
  activeQuestCount = 1,
}: {
  sidequestId: string
  activeQuestCount?: number
  onGenerateAnother?: (userId: string, questId: string, savedRequest: Record<string, unknown> | null) => Promise<void>
  generationState?: { status: 'idle' | 'loading' } | { status: 'error'; message: string }
}) {
  const { isLoaded, isSignedIn, user } = useUser()
  const userId = user?.id
  const routeKey = `${userId ?? ''}:${sidequestId}`
  const [storedState, setStoredState] = useState<SidequestState>({
    key: '',
    status: 'loading',
  })
  const state: SidequestState = storedState.key === routeKey
    ? storedState
    : { key: routeKey, status: 'loading' }
  const [isCompleting, setIsCompleting] = useState(false)
  const [isAbandoning, setIsAbandoning] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)
  const actionRef = useRef(false)
  const [showAbandonConfirmation, setShowAbandonConfirmation] = useState(false)
  const [completionMessage, setCompletionMessage] = useState('')
  const [completionError, setCompletionError] = useState('')
  const [abandonError, setAbandonError] = useState('')

  useEffect(() => {
    if (sidequestId === 'generating') return
    if (!isLoaded || !isSignedIn || !userId) return

    return subscribeToActiveSidequest(
      userId,
      sidequestId,
      (sidequest) => setStoredState(sidequest
        ? { key: routeKey, status: 'ready', sidequest }
        : { key: routeKey, status: 'not-found' }),
      (message) => setStoredState({ key: routeKey, status: 'error', message }),
    )
  }, [isLoaded, isSignedIn, userId, sidequestId, routeKey])

  async function handleComplete() {
    if (!userId || state.status !== 'ready' || actionRef.current) return
    actionRef.current = true
    setIsCompleting(true)
    setCompletionError('')
    setCompletionMessage('')
    try {
      const awardedXp = await completeSidequest(userId, sidequestId)
      setCompletionMessage(`Sidequest completed. You earned ${awardedXp} XP.`)
      setStoredState({ key: routeKey, status: 'not-found' })
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : 'Could not complete this sidequest.',
      )
    } finally {
      actionRef.current = false
      setIsCompleting(false)
    }
  }

  async function handleAbandon() {
    if (!userId || state.status !== 'ready' || actionRef.current) return
    actionRef.current = true
    setIsAbandoning(true)
    setAbandonError('')
    setCompletionMessage('')
    try {
      await abandonSidequest(userId, sidequestId)
      setCompletionMessage('Sidequest abandoned and removed from your active quests.')
      setStoredState({ key: routeKey, status: 'not-found' })
    } catch (error) {
      setAbandonError(error instanceof Error ? error.message : 'Could not abandon this sidequest.')
    } finally {
      actionRef.current = false
      setIsAbandoning(false)
      setShowAbandonConfirmation(false)
    }
  }

  async function handleGenerateAnother() {
    if (!userId || state.status !== 'ready' || !onGenerateAnother || actionRef.current) return
    if (activeQuestCount >= MAX_ACTIVE_QUESTS) return
    actionRef.current = true
    setIsReplacing(true)
    setAbandonError('')
    try {
      await onGenerateAnother(userId, sidequestId, state.sidequest.userRequest ?? null)
    } catch (error) {
      setAbandonError(error instanceof Error ? error.message : 'Could not generate another quest.')
    } finally {
      actionRef.current = false
      setIsReplacing(false)
    }
  }

  const sidequest = state.status === 'ready' ? state.sidequest : null
  const slotsRemaining = Math.max(0, MAX_ACTIVE_QUESTS - activeQuestCount)
  const userRequest = sidequest?.userRequest ?? null
  const requestedPreferences = typeof userRequest?.preferences === 'string'
    ? userRequest.preferences
    : ''
  const requestedLocation = typeof userRequest?.location === 'string'
    ? userRequest.location
    : ''
  const requestedGoals = Array.isArray(userRequest?.goals)
    ? userRequest.goals.filter((goal): goal is string => typeof goal === 'string')
    : []
  const directionsUrl = sidequest
    ? `https://www.google.com/maps/search/?api=1&query=${
        sidequest.latitude !== null && sidequest.longitude !== null
          ? `${sidequest.latitude},${sidequest.longitude}`
          : encodeURIComponent(sidequest.locationName)
      }`
    : null

  return (
    <>
      <Header title="Sidequest details" activeSidequestCount={activeQuestCount} />
      <main className="min-h-[calc(100vh-4rem)] bg-gradient-glow px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-6xl">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="mb-5 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              color: colors.foreground,
              borderColor: colors.border,
              outlineColor: colors.secondary,
            }}
          >
            <span aria-hidden="true">←</span>
            Back to Sidequester
          </button>

          {sidequestId === 'generating' && generationState?.status === 'loading' ? (
            <section
              className="rpg-panel overflow-hidden p-5 sm:p-8"
              role="status"
              aria-busy="true"
              aria-label="AI is creating your sidequest"
            >
              <div className="mx-auto max-w-3xl">
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-2xl border text-2xl shadow-[0_0_30px_rgb(68_151_255_/_18%)]"
                    style={{
                      color: colors.secondary,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceRaised,
                    }}
                    aria-hidden="true"
                  >
                    ✦
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: colors.secondary }}>
                      Quest forge · AI at work
                    </p>
                    <h1 className="mt-1 text-xl font-black sm:text-2xl">Building your sidequest</h1>
                  </div>
                </div>
                <p className="mt-5 max-w-xl text-sm leading-relaxed" style={{ color: colors.muted }}>
                  We’re turning your preferences into a real-world activity. Your description,
                  clear steps, and verified map destination will appear here as soon as it’s ready.
                </p>
                <div
                  className="mt-6 rounded-2xl border p-4 sm:p-5"
                  style={{ backgroundColor: colors.background, borderColor: colors.border }}
                >
                  <div className="h-4 w-2/3 animate-pulse rounded-full" style={{ backgroundColor: colors.surfaceRaised }} />
                  <div className="mt-3 h-3 w-full animate-pulse rounded-full" style={{ backgroundColor: colors.surfaceRaised }} />
                  <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full" style={{ backgroundColor: colors.surfaceRaised }} />
                  <div className="mt-6 space-y-3">
                    {[0, 1, 2].map((step) => (
                      <div key={step} className="flex items-center gap-3">
                        <span
                          className="flex size-8 shrink-0 animate-pulse items-center justify-center rounded-full border text-xs font-bold"
                          style={{ borderColor: colors.border, color: colors.muted }}
                        >
                          {step + 1}
                        </span>
                        <div className="h-3 w-full animate-pulse rounded-full" style={{ backgroundColor: colors.surfaceRaised }} />
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-4 flex items-center gap-2 text-xs" style={{ color: colors.muted }}>
                  <span className="size-2 animate-pulse rounded-full" style={{ backgroundColor: colors.primary }} />
                  Finding a useful, achievable quest and confirming its destination…
                </p>
              </div>
            </section>
          ) : sidequestId === 'generating' ? (
            <section className="rpg-panel mx-auto max-w-2xl p-6 text-center sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: colors.error }}>
                Quest forge interrupted
              </p>
              <h1 className="mt-2 text-2xl font-black">We couldn’t create that sidequest</h1>
              <p role="alert" className="mt-3 text-sm leading-relaxed" style={{ color: colors.muted }}>
                {generationState?.status === 'error'
                  ? generationState.message
                  : 'This generation is no longer active. Return to the quest board to start again.'}
              </p>
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="mt-6 min-h-11 cursor-pointer rounded-xl px-5 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  backgroundColor: colors.primary,
                  color: colors.primaryForeground,
                  outlineColor: colors.primary,
                }}
              >
                Return to quest board
              </button>
            </section>
          ) : !isLoaded || state.status === 'loading' ? (
            <section className="rpg-panel p-8 text-center" role="status">
              Loading sidequest…
            </section>
          ) : !isSignedIn || !userId ? (
            <section className="rpg-panel p-8 text-center">
              <p role="alert" style={{ color: colors.error }}>
                Sign in to view your sidequest details.
              </p>
            </section>
          ) : state.status === 'error' ? (
            <section className="rpg-panel p-8 text-center">
              <p role="alert" style={{ color: colors.error }}>{state.message}</p>
            </section>
          ) : state.status === 'not-found' ? (
            <section className="rpg-panel p-8 text-center">
              <h2 className="text-xl font-bold">Sidequest unavailable</h2>
              <p className="mt-2 text-sm" style={{ color: colors.muted }}>
                This sidequest may have been completed or no longer be available.
              </p>
              {completionMessage && (
                <p role="status" className="mt-3 text-sm" style={{ color: colors.success }}>
                  {completionMessage}
                </p>
              )}
            </section>
          ) : sidequest ? (
            <>
              <div className="mb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full border px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em]"
                    style={{
                      color: colors.success,
                      borderColor: colors.successBorder,
                      backgroundColor: colors.successBackground,
                    }}
                  >
                    Active sidequest
                  </span>
                  <span className="text-xs" style={{ color: colors.muted }}>
                    Created {formatDate(sidequest.createdAt)}
                  </span>
                </div>
                <h1 className="mt-3 max-w-4xl break-words text-3xl font-black leading-tight sm:text-5xl">
                  {sidequest.title}
                </h1>
              </div>

              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
                <div className="space-y-5">
                  <section className="rpg-panel p-5 sm:p-7">
                    <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
                      Your mission
                    </p>
                    <p className="mt-3 max-w-3xl text-base leading-relaxed sm:text-lg">
                      {sidequest.description}
                    </p>
                  </section>

                  <section className="rpg-panel p-5 sm:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
                          Quest plan
                        </p>
                        <h2 className="mt-1 text-xl font-black">Your steps</h2>
                      </div>
                      <span className="text-sm" style={{ color: colors.muted }}>
                        {sidequest.steps.length} steps
                      </span>
                    </div>
                    <ol className="mt-5 space-y-3">
                      {sidequest.steps.map((step, index) => (
                        <li
                          key={`${index}-${step}`}
                          className="flex items-start gap-3 rounded-xl border p-3.5 sm:p-4"
                          style={{ backgroundColor: colors.background, borderColor: colors.border }}
                        >
                          <span
                            className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black"
                            style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
                          >
                            {index + 1}
                          </span>
                          <span className="pt-1 text-sm leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </section>

                  {userRequest && (
                    <section className="rpg-panel p-5 sm:p-7">
                      <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.muted }}>
                        Your original request
                      </p>
                      <h2 className="mt-1 text-lg font-black">What you asked for</h2>
                      {requestedPreferences && (
                        <p className="mt-3 text-sm leading-relaxed" style={{ color: colors.muted }}>
                          {requestedPreferences}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {requestedLocation && (
                          <span
                            className="rounded-full border px-3 py-1.5 text-xs"
                            style={{ borderColor: colors.border, color: colors.foreground }}
                          >
                            Location: {requestedLocation}
                          </span>
                        )}
                        {requestedGoals.map((goal) => (
                          <span
                            key={goal}
                            className="rounded-full border px-3 py-1.5 text-xs"
                            style={{ borderColor: colors.border, color: colors.foreground }}
                          >
                            Goal: {goal}
                          </span>
                        ))}
                      </div>
                      <details className="mt-4">
                        <summary
                          className="cursor-pointer text-sm font-semibold"
                          style={{ color: colors.muted }}
                        >
                          View full request JSON
                        </summary>
                        <pre
                          className="mt-3 max-h-72 overflow-auto rounded-xl border p-4 text-xs leading-relaxed whitespace-pre-wrap break-words"
                          style={{
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                            color: colors.muted,
                          }}
                        >
                          {JSON.stringify(userRequest, null, 2)}
                        </pre>
                      </details>
                    </section>
                  )}
                </div>

                <aside className="rpg-panel p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
                        Quest intel
                      </p>
                      <h2 className="mt-1 text-lg font-black">At a glance</h2>
                    </div>
                    <span
                      className="shrink-0 rounded-full border px-3 py-1.5 text-sm font-black"
                      style={{
                        color: colors.secondary,
                        borderColor: colors.errorBorder,
                        backgroundColor: colors.errorBackground,
                      }}
                    >
                      +{sidequest.xpValue} XP
                    </span>
                  </div>
                  <dl className="mt-4">
                    <Detail label="Destination">{sidequest.locationName}</Detail>
                    <Detail label="Estimated time">{sidequest.estimatedMinutes} minutes</Detail>
                    <Detail label="Estimated cost">
                      {sidequest.estimatedCostDollars === 0 ? 'Free' : `$${sidequest.estimatedCostDollars}`}
                    </Detail>
                    <Detail label="Reward">Awarded after successful completion</Detail>
                  </dl>
                  <div className="mt-5 flex flex-col gap-3">
                    {directionsUrl && sidequest.locationName !== 'Anywhere' && (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-bold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          color: colors.foreground,
                          borderColor: colors.border,
                          outlineColor: colors.secondary,
                        }}
                      >
                        Open directions
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleComplete()}
                      disabled={isCompleting || isAbandoning || isReplacing}
                      className="min-h-12 cursor-pointer rounded-xl px-4 py-2.5 text-sm font-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        backgroundColor: colors.primary,
                        color: colors.primaryForeground,
                        outlineColor: colors.primary,
                      }}
                    >
                      {isCompleting ? 'Completing…' : 'Complete sidequest'}
                    </button>
                    {onGenerateAnother && <div className="space-y-2">
                      <button type="button" onClick={() => void handleGenerateAnother()}
                        disabled={isCompleting || isAbandoning || isReplacing || slotsRemaining === 0}
                        className="min-h-11 w-full cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                        style={{ borderColor: colors.border, color: colors.secondary }}>
                        {isReplacing ? 'Generating…' : `Generate another (${slotsRemaining} left)`}
                      </button>
                      <p className="text-xs" style={{ color: colors.muted }}>
                        {slotsRemaining === 0
                          ? 'You have three active quests. Complete or abandon one to free a slot.'
                          : 'Adds a quest using your latest filters or saved request. Your existing quests stay active; up to three total.'}
                      </p>
                    </div>}
                    {!showAbandonConfirmation ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAbandonError('')
                          setShowAbandonConfirmation(true)
                        }}
                        disabled={isCompleting || isAbandoning || isReplacing}
                        className="min-h-11 cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          borderColor: colors.errorBorder,
                          color: colors.error,
                          outlineColor: colors.error,
                        }}
                      >
                        Abandon sidequest
                      </button>
                    ) : (
                      <div
                        className="rounded-xl border p-3"
                        style={{ backgroundColor: colors.errorBackground, borderColor: colors.errorBorder }}
                      >
                        <p className="text-sm font-semibold">Abandon this sidequest?</p>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: colors.muted }}>
                          It will be removed from your active quests and no XP will be awarded.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAbandonConfirmation(false)}
                            disabled={isAbandoning}
                            className="min-h-10 cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                            style={{ borderColor: colors.border, color: colors.foreground }}
                          >
                            Keep quest
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAbandon()}
                            disabled={isAbandoning}
                            className="min-h-10 cursor-pointer rounded-lg px-3 py-2 text-xs font-bold disabled:cursor-wait disabled:opacity-60"
                            style={{ backgroundColor: colors.error, color: colors.primaryForeground }}
                          >
                            {isAbandoning ? 'Abandoning…' : 'Yes, abandon'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {completionError && (
                    <p role="alert" className="mt-3 text-sm" style={{ color: colors.error }}>
                      {completionError}
                    </p>
                  )}
                  {abandonError && (
                    <p role="alert" className="mt-3 text-sm" style={{ color: colors.error }}>
                      {abandonError}
                    </p>
                  )}
                </aside>
              </div>

              <section className="rpg-panel mt-5 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
                      Map point
                    </p>
                    <h2 className="mt-1 text-lg font-black">{sidequest.locationName}</h2>
                    <p className="mt-1 text-xs" style={{ color: colors.muted }}>
                      {sidequest.latitude.toFixed(5)}, {sidequest.longitude.toFixed(5)}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
                    style={{ borderColor: colors.border, color: colors.muted }}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: colors.secondary }} />
                    Verified destination
                  </span>
                </div>
                <SidequestMap
                  location={sidequest.locationName}
                  latitude={sidequest.latitude}
                  longitude={sidequest.longitude}
                />
              </section>
            </>
          ) : null}
        </div>
      </main>
    </>
  )
}

export default SidequestDetailPage
