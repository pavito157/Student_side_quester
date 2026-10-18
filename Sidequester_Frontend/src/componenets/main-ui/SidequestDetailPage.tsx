import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useUser } from '@clerk/clerk-react'
import Header from './Header'
import SidequestMap, { type SidequestMapStop } from './SidequestMap'
import { colors } from '../../constants/colors'
import { navigateTo } from '../../services/navigation'
import {
  abandonSidequest, completeSidequest, skipSidequestPhotoProof, submitSidequestPhotoProof,
  subscribeToActiveSidequest,
} from '../../services/sidequests'
import type { ActiveSidequest } from '../../types/sidequest'
import { MAX_ACTIVE_QUESTS } from '../../services/questAssignment'

type SidequestState =
  | { key: string; status: 'loading' }
  | { key: string; status: 'error'; message: string }
  | { key: string; status: 'ready'; sidequest: ActiveSidequest }
  | { key: string; status: 'not-found' }

const EMPTY_COMPLETED_STOPS: number[] = []

function formatDate(date: string): string {
  return new Date(date).toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function stopXpReward(
  totalXp: number, totalStops: number, index: number,
  proofMethods: ActiveSidequest['stepProofMethods'],
  stepDestinationIndexes: ActiveSidequest['stepDestinationIndexes'],
  skippedPhotoSteps: number[],
): number {
  const stopStepIndexes = stepDestinationIndexes.flatMap(
    (destinationIndex, stepIndex) => destinationIndex === index ? [stepIndex] : [],
  )
  const skippedThisStop = skippedPhotoSteps.some(
    (stepIndex) => stepDestinationIndexes[stepIndex] === index,
  )
  if (totalStops === 1) {
    return proofMethods.some((method) => method !== 'recreation') && skippedPhotoSteps.length === 0
      ? totalXp : 0
  }
  const eligibleStops = Array.from({ length: totalStops }, (_, stopIndex) => stopIndex)
    .filter((stopIndex) => stepDestinationIndexes.some(
      (destinationIndex, stepIndex) => destinationIndex === stopIndex
        && proofMethods[stepIndex] !== 'recreation',
    ))
  const rewardIndex = eligibleStops.indexOf(index)
  return rewardIndex < 0 || skippedThisStop || stopStepIndexes.length === 0
    ? 0
    : Math.floor(totalXp / eligibleStops.length) + (rewardIndex < totalXp % eligibleStops.length ? 1 : 0)
}

function getRewardProgress(
  totalXp: number, totalStops: number, completedStops: number[], skippedPhotoSteps: number[],
  proofMethods: ActiveSidequest['stepProofMethods'],
  stepDestinationIndexes: ActiveSidequest['stepDestinationIndexes'],
) {
  const skippedStops = new Set(skippedPhotoSteps.map((stepIndex) => stepDestinationIndexes[stepIndex]))
  const earnedXp = completedStops.reduce(
    (earned, index) => earned + (skippedStops.has(index)
      ? 0 : stopXpReward(totalXp, totalStops, index, proofMethods, stepDestinationIndexes, skippedPhotoSteps)),
    0,
  )
  const nextStopXp = completedStops.length < totalStops
    ? skippedStops.has(completedStops.length)
      ? 0 : stopXpReward(
        totalXp, totalStops, completedStops.length, proofMethods,
        stepDestinationIndexes, skippedPhotoSteps,
      )
    : 0
  const forfeitedXp = totalStops === 1 && skippedStops.has(0)
    ? totalXp
    : [...skippedStops].reduce(
      (total, index) => total + stopXpReward(
        totalXp, totalStops, index, proofMethods, stepDestinationIndexes, [],
      ), 0,
    )
  const eligibleXp = totalStops === 1
    ? proofMethods.some((method) => method !== 'recreation') ? totalXp : 0
    : stepDestinationIndexes.some((stopIndex) => stepDestinationIndexes.some(
      (mappedStop, stepIndex) => mappedStop === stopIndex && proofMethods[stepIndex] !== 'recreation',
    )) ? totalXp : 0
  return { earnedXp, nextStopXp, remainingXp: eligibleXp - earnedXp - forfeitedXp, forfeitedXp, eligibleXp }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function formatRequestedTime(value: unknown): string | null {
  const time = asRecord(value)
  if (!time || typeof time.selection !== 'string') return null
  switch (time.selection) {
    case 'any': return 'Any time'
    case '30': return '30 minutes or less'
    case '60': return '1 hour or less'
    case '120': return '2+ hours'
    case 'custom':
      return typeof time.customMinutes === 'number' && Number.isFinite(time.customMinutes)
        ? `${time.customMinutes} minutes`
        : 'Custom time'
    default: return null
  }
}

function formatRequestedBudget(value: unknown): string | null {
  const budget = asRecord(value)
  if (!budget || typeof budget.selection !== 'string') return null
  switch (budget.selection) {
    case 'any': return 'Any budget'
    case '0': return 'Free'
    case '10': return 'Under $10'
    case '10-25': return '$10–$25'
    case 'custom':
      return typeof budget.customDollars === 'number' && Number.isFinite(budget.customDollars)
        ? `Up to $${budget.customDollars}`
        : 'Custom budget'
    default: return null
  }
}

function formatRequestedDistance(value: unknown): string | null {
  if (value === null) return 'Any distance'
  const distance = asRecord(value)
  if (!distance
    || typeof distance.maxDistance !== 'number'
    || !Number.isFinite(distance.maxDistance)
    || distance.unit !== 'miles') {
    return null
  }
  return `Within ${distance.maxDistance} miles`
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
  const [photoProofBusyStep, setPhotoProofBusyStep] = useState<number | null>(null)
  const [photoProofFeedback, setPhotoProofFeedback] = useState<Record<number, string>>({})

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

  async function handleComplete(stopIndex = 0) {
    if (!userId || state.status !== 'ready' || actionRef.current) return
    actionRef.current = true
    setIsCompleting(true)
    setCompletionError('')
    setCompletionMessage('')
    try {
      const progress = await completeSidequest(userId, sidequestId, stopIndex, needsLocationForNextStep)
      if (progress.status === 'completed') {
        setCompletionMessage(`Sidequest completed. You earned ${progress.xpAwardedSoFar} XP in total.`)
        setStoredState({ key: routeKey, status: 'not-found' })
      } else if (state.status === 'ready') {
        const skippedThisStop = state.sidequest.skippedPhotoSteps.some(
          (stepIndex) => state.sidequest.stepDestinationIndexes[stepIndex] === stopIndex,
        )
        setCompletionMessage(progress.xpAwarded === 0 && skippedThisStop
          ? `Stop ${stopIndex + 1} complete. No XP was awarded because photo proof was skipped.`
          : `Stop ${stopIndex + 1} complete. You earned ${progress.xpAwarded} XP.`)
        setStoredState({
          key: routeKey,
          status: 'ready',
          sidequest: {
            ...state.sidequest,
            completedStops: progress.completedStops,
            xpAwardedSoFar: progress.xpAwardedSoFar,
          },
        })
      }
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : 'Could not complete this sidequest.',
      )
    } finally {
      actionRef.current = false
      setIsCompleting(false)
    }
  }

  async function handlePhotoProof(stepIndex: number, image?: File) {
    if (!userId || state.status !== 'ready' || !image || actionRef.current) return
    actionRef.current = true
    setPhotoProofBusyStep(stepIndex)
    setPhotoProofFeedback((previous) => ({ ...previous, [stepIndex]: 'Reviewing photo…' }))
    try {
      const result = await submitSidequestPhotoProof(userId, sidequestId, stepIndex, image)
      setPhotoProofFeedback((previous) => ({ ...previous, [stepIndex]: result.feedback }))
      if (result.accepted && result.verifiedPhotoSteps) {
        setStoredState({
          key: routeKey,
          status: 'ready',
          sidequest: { ...state.sidequest, verifiedPhotoSteps: result.verifiedPhotoSteps },
        })
      }
    } catch (error) {
      setPhotoProofFeedback((previous) => ({
        ...previous,
        [stepIndex]: error instanceof Error ? error.message : 'Could not review this photo.',
      }))
    } finally {
      actionRef.current = false
      setPhotoProofBusyStep(null)
    }
  }

  async function handlePhotoProofSkip(stepIndex: number) {
    if (!userId || state.status !== 'ready' || actionRef.current) return
    actionRef.current = true
    setPhotoProofBusyStep(stepIndex)
    setPhotoProofFeedback((previous) => ({
      ...previous,
      [stepIndex]: `Skipping photo proof; XP for this ${sidequestStops.length > 1 ? 'stop' : 'quest'} will be forfeited.`,
    }))
    try {
      const skippedPhotoSteps = await skipSidequestPhotoProof(userId, sidequestId, stepIndex)
      setStoredState({
        key: routeKey,
        status: 'ready',
        sidequest: { ...state.sidequest, skippedPhotoSteps },
      })
    } catch (error) {
      setPhotoProofFeedback((previous) => ({
        ...previous,
        [stepIndex]: error instanceof Error ? error.message : 'Could not skip photo proof.',
      }))
    } finally {
      actionRef.current = false
      setPhotoProofBusyStep(null)
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
  const sidequestStops = sidequest?.destinations ?? (sidequest ? [{
    locationName: sidequest.locationName,
    placeId: sidequest.placeId,
    latitude: sidequest.latitude,
    longitude: sidequest.longitude,
  }] : [])
  const completedStops = sidequest?.completedStops ?? EMPTY_COMPLETED_STOPS
  const nextStopIndex = completedStops.length
  const rewardProgress = sidequest
    ? getRewardProgress(
      sidequest.xpValue, sidequestStops.length, completedStops,
      sidequest.skippedPhotoSteps, sidequest.stepProofMethods, sidequest.stepDestinationIndexes,
    )
    : null
  const requiredPhotoSteps = sidequest
    ? sidequest.stepProofMethods.flatMap((method, index) =>
      method === 'photo' && sidequest.stepDestinationIndexes[index] === nextStopIndex ? [index] : [])
    : []
  const missingPhotoProof = Boolean(sidequest && requiredPhotoSteps.some((index) =>
    !sidequest.verifiedPhotoSteps.includes(index) && !sidequest.skippedPhotoSteps.includes(index)))
  const nextStopMethods = sidequest
    ? sidequest.stepProofMethods.filter(
      (_method, index) => sidequest.stepDestinationIndexes[index] === nextStopIndex,
    )
    : []
  const nextStopWasSkipped = Boolean(sidequest && sidequest.skippedPhotoSteps.some(
    (stepIndex) => sidequest.stepDestinationIndexes[stepIndex] === nextStopIndex,
  ))
  const needsLocationForNextStep = nextStopMethods.includes('location')
  const mapStops: SidequestMapStop[] = sidequestStops.map((stop, index) => ({
    name: stop.locationName,
    placeId: stop.placeId,
    latitude: stop.latitude,
    longitude: stop.longitude,
    step: sidequest
      ? sidequest.steps.filter((_step, stepIndex) => sidequest.stepDestinationIndexes[stepIndex] === index).join(' ')
      : 'Explore this destination.',
    completed: completedStops.includes(index),
  }))
  const requestedOrigin = asRecord(userRequest?.originCoordinates)
  const originLatitude = requestedOrigin?.latitude ?? userRequest?.latitude
  const originLongitude = requestedOrigin?.longitude ?? userRequest?.longitude
  const originCoordinates = typeof originLatitude === 'number' && Number.isFinite(originLatitude)
    && Math.abs(originLatitude) <= 90
    && typeof originLongitude === 'number' && Number.isFinite(originLongitude)
    && Math.abs(originLongitude) <= 180
    ? { latitude: originLatitude, longitude: originLongitude }
    : null
  const requestedPreferences = typeof userRequest?.preferences === 'string'
    ? userRequest.preferences
    : ''
  const requestedLocation = typeof userRequest?.location === 'string'
    ? userRequest.location
    : ''
  const requestedGoals = Array.isArray(userRequest?.goals)
    ? userRequest.goals.filter((goal): goal is string => typeof goal === 'string')
    : []
  const requestedTime = formatRequestedTime(userRequest?.time)
  const requestedBudget = formatRequestedBudget(userRequest?.budget)
  const requestedDistance = userRequest && 'distance' in userRequest
    ? formatRequestedDistance(userRequest.distance)
    : null
  const destinationQuery = sidequest ? `${sidequest.latitude},${sidequest.longitude}` : ''
  const destinationUrl = sidequest
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationQuery)}`
      + (sidequest.placeId ? `&query_place_id=${encodeURIComponent(sidequest.placeId)}` : '')
    : null
  const directionsUrl = sidequest
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationQuery)}`
      + (sidequest.placeId ? `&destination_place_id=${encodeURIComponent(sidequest.placeId)}` : '')
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
                <div className="mt-3">
                  <h1 className="max-w-4xl break-words text-3xl font-black leading-tight sm:text-5xl">
                    {sidequest.title}
                  </h1>
                </div>
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
                          <div className="min-w-0 flex-1">
                            {sidequestStops.length > 1 && (
                              <p className="mb-1 text-xs font-bold" style={{ color: colors.secondary }}>
                                Stop {sidequest.stepDestinationIndexes[index] + 1} · {sidequestStops[sidequest.stepDestinationIndexes[index]]?.locationName}
                              </p>
                            )}
                            <p className="pt-1 text-sm leading-relaxed">{step}</p>
                            <p className="mt-1 text-xs font-semibold" style={{ color: colors.muted }}>
                              {sidequest.stepProofMethods[index] === 'photo'
                                ? 'Photo verification · XP eligible'
                                : sidequest.stepProofMethods[index] === 'location'
                                  ? 'Location verification · XP eligible'
                                  : 'Recreation · no verification or XP'}
                            </p>
                            {sidequest.stepProofMethods[index] === 'photo' && (
                              <div
                                className="mt-3 rounded-lg border p-3"
                                style={{ borderColor: colors.border, backgroundColor: colors.surfaceRaised }}
                              >
                                <p className="text-xs leading-relaxed" style={{ color: colors.muted }}>
                                  Photo proof is reviewed for this step and is not saved.
                                </p>
                                {sidequest.verifiedPhotoSteps.includes(index) ? (
                                  <p className="mt-2 text-xs font-semibold" style={{ color: colors.success }}>
                                    Photo proof accepted
                                  </p>
                                ) : sidequest.skippedPhotoSteps.includes(index) ? (
                                  <p className="mt-2 text-xs font-semibold" style={{ color: colors.secondary }}>
                                    Proof skipped · no XP for this {sidequestStops.length > 1 ? 'stop' : 'quest'}
                                  </p>
                                ) : (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <label
                                      className="inline-flex min-h-9 cursor-pointer items-center rounded-lg px-3 py-2 text-xs font-bold focus-within:outline-2 focus-within:outline-offset-2"
                                      style={{
                                        backgroundColor: colors.primary,
                                        color: colors.primaryForeground,
                                        outlineColor: colors.primary,
                                      }}
                                    >
                                      {photoProofBusyStep === index ? 'Reviewing…' : 'Add photo proof'}
                                      <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        capture="environment"
                                        className="sr-only"
                                        disabled={photoProofBusyStep !== null || isCompleting || isAbandoning || isReplacing}
                                        onChange={(event) => {
                                          const image = event.currentTarget.files?.[0]
                                          event.currentTarget.value = ''
                                          void handlePhotoProof(index, image)
                                        }}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => void handlePhotoProofSkip(index)}
                                      disabled={photoProofBusyStep !== null || isCompleting || isAbandoning || isReplacing}
                                      className="min-h-9 cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                                      style={{ borderColor: colors.border, color: colors.secondary }}
                                    >
                                      Can’t take a picture? Skip proof (no XP)
                                    </button>
                                  </div>
                                )}
                                {photoProofFeedback[index] && (
                                  <p role="status" className="mt-2 text-xs leading-relaxed" style={{ color: colors.muted }}>
                                    {photoProofFeedback[index]}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>

                <aside className="rpg-panel self-start p-5 sm:p-6">
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
                      {sidequest.xpValue > 0 ? `+${sidequest.xpValue} XP` : 'Recreation · no XP'}
                    </span>
                  </div>
                  <dl className="mt-4">
                    <Detail label="Destination">{sidequest.locationName}</Detail>
                    <Detail label="Estimated time">{sidequest.estimatedMinutes} minutes</Detail>
                    <Detail label="Estimated cost">
                      {sidequest.estimatedCostDollars === 0 ? 'Free' : `$${sidequest.estimatedCostDollars}`}
                    </Detail>
                  </dl>
                  {rewardProgress && (
                    <section
                      aria-label="XP reward progress"
                      className="mt-4 rounded-xl border p-3.5"
                      style={{ borderColor: colors.border, backgroundColor: colors.background }}
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold">XP reward</span>
                        <span className="font-black" style={{ color: colors.secondary }}>
                          {rewardProgress.earnedXp} / {sidequest.xpValue} XP earned
                        </span>
                      </div>
                      {sidequest.xpValue > 0 && (
                        <div
                          role="progressbar"
                          aria-label="XP reward progress"
                          aria-valuemin={0}
                          aria-valuemax={sidequest.xpValue}
                          aria-valuenow={rewardProgress.earnedXp}
                          className="mt-2 h-2 overflow-hidden rounded-full"
                          style={{ backgroundColor: colors.surfaceRaised }}
                        >
                          <div
                            className="h-full rounded-full transition-[width]"
                            style={{
                              width: `${(rewardProgress.earnedXp / sidequest.xpValue) * 100}%`,
                              backgroundColor: colors.success,
                            }}
                          />
                        </div>
                      )}
                      <p className="mt-2 text-xs leading-relaxed" style={{ color: colors.muted }}>
                        {rewardProgress.eligibleXp === 0
                          ? 'This recreation-only quest is for fun and does not award XP.'
                          : nextStopIndex >= sidequestStops.length
                            ? 'All XP for this sidequest has been earned.'
                            : rewardProgress.nextStopXp > 0
                              ? `${sidequestStops.length > 1 ? 'Complete the next stop' : 'Complete the quest'} using its selected verification to earn +${rewardProgress.nextStopXp} XP. ${rewardProgress.remainingXp} XP remains.`
                              : 'No XP is available for the next step.'}
                      </p>
                      {rewardProgress.forfeitedXp > 0 && (
                        <p className="mt-2 text-xs leading-relaxed" style={{ color: colors.secondary }}>
                          {rewardProgress.forfeitedXp} XP has been forfeited because photo proof was skipped.
                        </p>
                      )}
                    </section>
                  )}
                  {sidequestStops.length > 1 && (
                    <div className="mt-4 rounded-xl border p-3.5" style={{ borderColor: colors.border }}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold">Route progress</span>
                        <span style={{ color: colors.muted }}>
                          {completedStops.length} of {sidequestStops.length} stops
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label="Quest stop progress"
                        aria-valuemin={0}
                        aria-valuemax={sidequestStops.length}
                        aria-valuenow={completedStops.length}
                        className="mt-2 h-2 overflow-hidden rounded-full"
                        style={{ backgroundColor: colors.surfaceRaised }}
                      >
                        <div
                          className="h-full rounded-full transition-[width]"
                          style={{
                            width: `${(completedStops.length / sidequestStops.length) * 100}%`,
                            backgroundColor: colors.success,
                          }}
                        />
                      </div>
                      {nextStopIndex < sidequestStops.length && (
                        <p className="mt-2 truncate text-xs" style={{ color: colors.muted }}>
                          Next: {sidequestStops[nextStopIndex].locationName}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    {destinationUrl && (
                      <a
                        href={destinationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          color: colors.secondary,
                          borderColor: colors.secondary,
                          outlineColor: colors.secondary,
                        }}
                      >
                        Open destination
                        <span aria-hidden="true">↗</span>
                      </a>
                    )}
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
                        Get directions
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleComplete(nextStopIndex)}
                      disabled={isCompleting || isAbandoning || isReplacing || photoProofBusyStep !== null || missingPhotoProof}
                      className="min-h-12 cursor-pointer rounded-xl px-4 py-2.5 text-sm font-black transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 sm:col-span-2 lg:col-span-1"
                      style={{
                        backgroundColor: colors.primary,
                        color: colors.primaryForeground,
                        outlineColor: colors.primary,
                      }}
                    >
                      {isCompleting
                        ? needsLocationForNextStep ? 'Verifying location…' : 'Completing quest…'
                        : sidequestStops.length > 1
                          ? nextStopWasSkipped
                            ? `Complete Stop ${nextStopIndex + 1} · skipped proof · no XP`
                            : nextStopMethods.every((method) => method === 'recreation')
                            ? `Complete Stop ${nextStopIndex + 1} · Recreation · no XP`
                            : `Complete Stop ${nextStopIndex + 1} · +${stopXpReward(
                              sidequest.xpValue, sidequestStops.length, nextStopIndex,
                              sidequest.stepProofMethods, sidequest.stepDestinationIndexes,
                              sidequest.skippedPhotoSteps,
                            )} XP`
                          : sidequest.xpValue === 0
                            ? 'Complete recreation quest · no XP'
                            : 'Complete sidequest'}
                    </button>
                    {missingPhotoProof && (
                      <p className="text-xs leading-relaxed sm:col-span-2 lg:col-span-1" style={{ color: colors.muted }}>
                        Add the requested photo proof or explicitly skip it to continue. Skipping means no XP for this quest.
                      </p>
                    )}
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
                        className="min-h-11 cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 sm:col-span-2 lg:col-span-1"
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

                {userRequest && (
                  <section className="rpg-panel p-5 sm:p-7 lg:col-span-2">
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
                        {requestedDistance && (
                          <span
                            className="rounded-full border px-3 py-1.5 text-xs"
                            style={{ borderColor: colors.border, color: colors.foreground }}
                          >
                            Distance: {requestedDistance}
                          </span>
                        )}
                        {requestedTime && (
                          <span
                            className="rounded-full border px-3 py-1.5 text-xs"
                            style={{ borderColor: colors.border, color: colors.foreground }}
                          >
                            Time: {requestedTime}
                          </span>
                        )}
                        {requestedBudget && (
                          <span
                            className="rounded-full border px-3 py-1.5 text-xs"
                            style={{ borderColor: colors.border, color: colors.foreground }}
                          >
                            Budget: {requestedBudget}
                          </span>
                        )}
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

              <section className="rpg-panel mt-5 overflow-hidden">
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
                      Route map
                    </p>
                    <h2 className="mt-1 text-lg font-black">
                      {sidequestStops.length === 1
                        ? sidequestStops[0].locationName
                        : `${sidequestStops.length} verified destinations`}
                    </h2>
                    <p className="mt-1 text-xs" style={{ color: colors.muted }}>
                      {completedStops.length} of {sidequestStops.length} stops complete
                      {originCoordinates ? ' · Route starts at your selected location' : ' · Starting location unavailable'}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
                    style={{
                      borderColor: colors.successBorder,
                      color: colors.success,
                      backgroundColor: colors.successBackground,
                    }}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: colors.success }} />
                    {sidequestStops.length > 1 ? 'Ordered quest stops' : 'Verified destination'}
                  </span>
                </div>
                <SidequestMap
                  stops={mapStops}
                  origin={originCoordinates}
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
