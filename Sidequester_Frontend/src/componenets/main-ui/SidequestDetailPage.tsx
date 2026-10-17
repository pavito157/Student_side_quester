import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useUser } from '@clerk/clerk-react'
import Header from './Header'
import SidequestMap from './SidequestMap'
import { colors } from '../../constants/colors'
import { navigateTo } from '../../services/navigation'
import { completeSidequest, subscribeToActiveSidequest } from '../../services/sidequests'
import type { ActiveSidequest } from '../../types/sidequest'

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

function SidequestDetailPage({ sidequestId }: { sidequestId: string }) {
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
  const [completionMessage, setCompletionMessage] = useState('')
  const [completionError, setCompletionError] = useState('')

  useEffect(() => {
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
    if (!userId || state.status !== 'ready') return
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
      setIsCompleting(false)
    }
  }

  const sidequest = state.status === 'ready' ? state.sidequest : null
  const directionsUrl = sidequest
    ? `https://www.google.com/maps/search/?api=1&query=${
        sidequest.latitude !== null && sidequest.longitude !== null
          ? `${sidequest.latitude},${sidequest.longitude}`
          : encodeURIComponent(sidequest.locationName)
      }`
    : null

  return (
    <>
      <Header title="Sidequest details" />
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

          {!isLoaded || state.status === 'loading' ? (
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
                <p
                  className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
                  style={{ color: colors.secondary }}
                >
                  Active sidequest
                </p>
                <h1 className="mt-1 break-words text-2xl font-black sm:text-4xl">
                  {sidequest.title}
                </h1>
                <p className="mt-2 text-sm" style={{ color: colors.muted }}>
                  Created {formatDate(sidequest.createdAt)}
                </p>
              </div>

              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
                <SidequestMap
                  location={sidequest.locationName}
                  latitude={sidequest.latitude}
                  longitude={sidequest.longitude}
                />

                <section className="rpg-panel p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">Sidequest details</h2>
                    <span
                      className="shrink-0 rounded-full border px-3 py-1 text-sm font-bold"
                      style={{
                        color: colors.secondary,
                        borderColor: colors.errorBorder,
                        backgroundColor: colors.errorBackground,
                      }}
                    >
                      +{sidequest.xpValue} XP
                    </span>
                  </div>

                  <dl className="mt-3">
                    <Detail label="Destination">{sidequest.locationName}</Detail>
                    <Detail label="Quest">{sidequest.description}</Detail>
                    <Detail label="Steps">
                      <ol className="list-inside list-decimal">
                        {sidequest.steps.map((step, index) => <li key={index}>{step}</li>)}
                      </ol>
                    </Detail>
                    <Detail label="Estimated time">{sidequest.estimatedMinutes} minutes</Detail>
                    <Detail label="Estimated cost">${sidequest.estimatedCostDollars}</Detail>
                  </dl>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {directionsUrl && sidequest.locationName !== 'Anywhere' && (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          color: colors.foreground,
                          borderColor: colors.border,
                          outlineColor: colors.secondary,
                        }}
                      >
                        Open in Google Maps
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleComplete()}
                      disabled={isCompleting}
                      className="min-h-11 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        backgroundColor: colors.primary,
                        color: colors.primaryForeground,
                        outlineColor: colors.primary,
                      }}
                    >
                      {isCompleting ? 'Completing…' : 'Complete sidequest'}
                    </button>
                  </div>
                  {completionError && (
                    <p role="alert" className="mt-3 text-sm" style={{ color: colors.error }}>
                      {completionError}
                    </p>
                  )}
                </section>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </>
  )
}

export default SidequestDetailPage
