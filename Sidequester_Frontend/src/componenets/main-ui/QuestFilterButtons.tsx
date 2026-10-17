import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useUser } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import { buildSidequestRequest } from '../../services/sidequestJson'
import { saveSidequestRequest } from '../../services/sidequests'
import {
  requestAssignedQuest,
  toQuestApiPayload,
  type SavedQuestResponse,
} from '../../services/questAssignment'
import { getUserGoals, getUserPreferences } from '../../services/userPreferences'
import type {
  BudgetConstraint,
  DistanceConstraint,
  TimeConstraint,
} from '../../types/sidequest'
import type { Vibe } from '../../types/vibe'
import BudgetButton from '../Buttons/BudgetButton'
import DistanceButton from '../Buttons/DistanceButton'
import SidequestMeButton from '../Buttons/SidequestMeButton'
import TimeButton from '../Buttons/TimeButton'
import WhereButton from '../Buttons/WhereButton'
import SidequestJsonModal from './SidequestJsonModal'

export type QuestFilters = {
  where: string
  latitude: number | null
  longitude: number | null
  time: string
  budget: string
  customTime: string
  customBudget: string
  distance: string
  customDistance: string
}

interface QuestFilterButtonsProps {
  filters: QuestFilters
  setFilters: Dispatch<SetStateAction<QuestFilters>>
  activeVibe: Vibe | null
  onClearActiveVibe: () => void
}

function getUsername(user: ReturnType<typeof useUser>['user'], email: string | null): string {
  return (
    user?.username?.trim() ||
    user?.fullName?.trim() ||
    user?.firstName?.trim() ||
    email?.split('@')[0] ||
    'Guest'
  )
}

function getTimeSelection(value: string): TimeConstraint['selection'] {
  switch (value) {
    case '':
    case 'any':
    case '30':
    case '60':
    case '120':
    case 'custom':
      return value === '' ? 'any' : value
    default:
      throw new Error('Choose a valid time constraint.')
  }
}

function getBudgetSelection(value: string): BudgetConstraint['selection'] {
  switch (value) {
    case '':
    case 'any':
    case '0':
    case '10':
    case '10-25':
    case 'custom':
      return value === '' ? 'any' : value
    default:
      throw new Error('Choose a valid budget constraint.')
  }
}

function getDistanceConstraint(value: string, customValue: string): DistanceConstraint {
  switch (value) {
    case '':
    case 'any':
      return null
    case '1':
    case '5':
    case '10':
    case '25':
      return { maxDistance: Number(value), unit: 'miles' }
    case 'custom': {
      const maxDistance = Number(customValue)
      if (customValue.trim() === '' || !Number.isFinite(maxDistance) || maxDistance <= 0) {
        throw new Error('Custom distance must be a number greater than zero miles.')
      }
      return { maxDistance, unit: 'miles' }
    }
    default:
      throw new Error('Choose a valid distance constraint.')
  }
}

function QuestFilterControls({
  filters,
  setFilters,
  activeVibe,
  onClearActiveVibe,
}: QuestFilterButtonsProps) {
  const { isLoaded, isSignedIn, user } = useUser()
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [historyWarning, setHistoryWarning] = useState('')
  const [assignment, setAssignment] = useState<SavedQuestResponse | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)
  const [requestJson, setRequestJson] = useState('')
  const [guestPreference, setGuestPreference] = useState('')

  useEffect(() => () => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  async function showSidequestRequest() {
    if (inFlightRef.current) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    inFlightRef.current = true
    setIsPreviewOpen(true)
    setIsLoadingPreview(true)
    setPreviewError('')
    setHistoryWarning('')
    setAssignment(null)
    setRequestJson('')

    try {
      if (!isLoaded) throw new Error('Your account is still loading. Please try again.')

      const [savedPreferences, goals] =
        isSignedIn && user
          ? await Promise.all([getUserPreferences(user.id), getUserGoals(user.id)])
          : ['', []]
      const preferences = isSignedIn ? savedPreferences : guestPreference.trim()
      const email = user?.primaryEmailAddress?.emailAddress ?? null
      const customMinutes =
        filters.time === 'custom' && filters.customTime !== ''
          ? Number(filters.customTime)
          : null
      const customDollars =
        filters.budget === 'custom' && filters.customBudget !== ''
          ? Number(filters.customBudget)
          : null
      const request = buildSidequestRequest({
        preferences,
        username: getUsername(user, email),
        location: filters.where === 'any' ? 'Anywhere' : filters.where || 'Not selected',
        originCoordinates: filters.latitude !== null && filters.longitude !== null
          ? { latitude: filters.latitude, longitude: filters.longitude }
          : null,
        latitude: filters.latitude,
        longitude: filters.longitude,
        time: {
          selection: getTimeSelection(filters.time),
          customMinutes,
        },
        budget: {
          selection: getBudgetSelection(filters.budget),
          customDollars,
        },
        distance: getDistanceConstraint(filters.distance, filters.customDistance),
        goals,
        vibePreferences: activeVibe?.preferences ?? null,
      })

      if (controller.signal.aborted) return
      const apiRequest = toQuestApiPayload(request)
      setRequestJson(JSON.stringify(apiRequest, null, 2))

      if (!isSignedIn || !user) {
        throw new Error('Sign in with a verified email account to get a saved quest.')
      }
      const saved = await requestAssignedQuest(user.id, apiRequest, { signal: controller.signal })
      if (controller.signal.aborted) return
      setAssignment(saved)
      // Preserve request-history metadata without delaying or blocking the quest.
      if (!saved.reusedExisting) {
        void saveSidequestRequest(user.id, email, request).catch(() => {
          if (!controller.signal.aborted) {
            setHistoryWarning('Your quest was saved, but request history could not be updated.')
          }
        })
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setPreviewError(
        error instanceof Error ? error.message : 'Could not get your sidequest. Please try again.',
      )
    } finally {
      if (controllerRef.current === controller) {
        inFlightRef.current = false
        setIsLoadingPreview(false)
      }
    }
  }

  return (
    <div className="space-y-5">
      {activeVibe && (
        <div
          className="quest-tag flex items-start justify-between gap-3 rounded-xl border-l-2 px-4 py-3"
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderLeftColor: colors.secondary,
          }}
        >
          <div className="min-w-0">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: colors.secondary }}
            >
              Using vibe: {activeVibe.name}
            </p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: colors.foreground }}>
              {activeVibe.preferences}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearActiveVibe}
            className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderColor: colors.errorBorder,
              color: colors.error,
              outlineColor: colors.error,
            }}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-3.5">
              <path
                d="m5 5 10 10M15 5 5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            Remove vibe
          </button>
        </div>
      )}

      <section
        aria-labelledby="quest-location-heading"
        className="quest-subpanel p-4 sm:p-5"
        style={{ backgroundColor: colors.background, borderColor: colors.border }}
      >
        <div className="mb-3">
          <h3 id="quest-location-heading" className="text-sm font-semibold">
            Choose a location
          </h3>
          <p className="mt-1 text-xs" style={{ color: colors.muted }}>
            Search for a place or use your current location.
          </p>
        </div>
        <WhereButton
          autoLocate={isSignedIn === true && !activeVibe && !filters.where}
          value={filters.where}
          onChange={(where, coordinates) =>
            setFilters((current) => ({
              ...current,
              where,
              latitude: coordinates?.latitude ?? null,
              longitude: coordinates?.longitude ?? null,
            }))
          }
        />
      </section>

      <section aria-label="Quest filters">
        <h3 className="mb-3 text-sm font-semibold">Fine-tune your quest</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="min-w-0 space-y-2">
            <span className="block text-xs font-medium" style={{ color: colors.muted }}>
              Time
            </span>
            <TimeButton
              value={filters.time}
              customValue={filters.customTime}
              onChange={(time) => setFilters((current) => ({ ...current, time }))}
              onCustomChange={(customTime) =>
                setFilters((current) => ({ ...current, customTime }))
              }
            />
          </div>
          <div className="min-w-0 space-y-2">
            <span className="block text-xs font-medium" style={{ color: colors.muted }}>
              Budget
            </span>
            <BudgetButton
              value={filters.budget}
              customValue={filters.customBudget}
              onChange={(budget) => setFilters((current) => ({ ...current, budget }))}
              onCustomChange={(customBudget) =>
                setFilters((current) => ({ ...current, customBudget }))
              }
            />
          </div>
          <div className="min-w-0 space-y-2">
            <span className="block text-xs font-medium" style={{ color: colors.muted }}>
              Distance
            </span>
            <DistanceButton
              value={filters.distance}
              customValue={filters.customDistance}
              onChange={(distance) => setFilters((current) => ({ ...current, distance }))}
              onCustomChange={(customDistance) =>
                setFilters((current) => ({ ...current, customDistance }))
              }
            />
          </div>
        </div>
      </section>

      {isLoaded && isSignedIn === false && (
        <section
          aria-labelledby="guest-preference-label"
          className="rounded-xl border p-4"
          style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border }}
        >
          <label
            id="guest-preference-label"
            htmlFor="guest-preference"
            className="block text-sm font-semibold"
            style={{ color: colors.secondary }}
          >
            Add a preference for this quest
          </label>
          <textarea
            id="guest-preference"
            maxLength={240}
            rows={2}
            value={guestPreference}
            onChange={(event) => setGuestPreference(event.target.value)}
            placeholder="e.g. I’d like to get outside and learn something new."
            className="mt-2 w-full resize-y rounded-lg border px-3 py-2.5 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.foreground,
              outlineColor: colors.primary,
            }}
          />
          <p className="mt-1.5 text-xs" style={{ color: colors.muted }}>
            This preference is only included in this request and won’t be saved.
          </p>
        </section>
      )}

      <SidequestMeButton onClick={() => void showSidequestRequest()} isLoading={isLoadingPreview} />
      <SidequestJsonModal
        isOpen={isPreviewOpen}
        isLoading={isLoadingPreview}
        requestJson={requestJson}
        errorMessage={previewError}
        response={assignment}
        historyWarning={historyWarning}
        onClose={() => setIsPreviewOpen(false)}
      />
    </div>
  )
}

// A different account gets fresh UI state and aborts the old account's request.
function QuestFilterButtons(props: QuestFilterButtonsProps) {
  const { user } = useUser()
  return <QuestFilterControls key={user?.id ?? 'guest'} {...props} />
}

export default QuestFilterButtons
