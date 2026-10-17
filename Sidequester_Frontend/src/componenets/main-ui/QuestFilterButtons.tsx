import { useState, type Dispatch, type SetStateAction } from 'react'
import { useUser } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import { buildSidequestRequest, serializeSidequestRequest } from '../../services/sidequestJson'
import { saveSidequestRequest } from '../../services/sidequests'
import { getUserGoals, getUserPreferences } from '../../services/userPreferences'
import type { BudgetConstraint, TimeConstraint } from '../../types/sidequest'
import type { Vibe } from '../../types/vibe'
import BudgetButton from '../Buttons/BudgetButton'
import DistanceButton from '../Buttons/DistanceButton'
import SidequestMeButton from '../Buttons/SidequestMeButton'
import TimeButton from '../Buttons/TimeButton'
import WhereButton from '../Buttons/WhereButton'
import SidequestJsonModal from './SidequestJsonModal'

export type QuestFilters = {
  where: string
  time: string
  budget: string
  customTime: string
  customBudget: string
  distance: string
}

type QuestInputPreview = {
  location: string
  preferences: string
  vibeName: string
  vibePreferences: string
  goals: string[]
  time: string
  budget: string
  distance: string
}

interface QuestFilterButtonsProps {
  filters: QuestFilters
  setFilters: Dispatch<SetStateAction<QuestFilters>>
  activeVibe: Vibe | null
  onClearActiveVibe: () => void
}

function getUsername(
  user: ReturnType<typeof useUser>['user'],
  email: string | null,
): string {
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

function QuestFilterButtons({
  filters: selectedFilters,
  setFilters: setSelectedFilters,
  activeVibe,
  onClearActiveVibe,
}: QuestFilterButtonsProps) {
  const { isLoaded, isSignedIn, user } = useUser()
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [persistenceMessage, setPersistenceMessage] = useState('')
  const [requestJson, setRequestJson] = useState('')
  const [requestCount, setRequestCount] = useState<number | null>(null)

  async function showSidequestRequest() {
    setIsPreviewOpen(true)
    setIsLoadingPreview(true)
    setPreviewError('')
    setPersistenceMessage('')
    setRequestJson('')
    setRequestCount(null)

    try {
      if (!isLoaded) throw new Error('Your account is still loading. Please try again.')

      const [preferences, goals] = isSignedIn && user
        ? await Promise.all([getUserPreferences(user.id), getUserGoals(user.id)])
        : ['', []]
      const email = user?.primaryEmailAddress?.emailAddress ?? null
      const customMinutes =
        selectedFilters.time === 'custom' && selectedFilters.customTime !== ''
          ? Number(selectedFilters.customTime)
          : null
      const customDollars =
        selectedFilters.budget === 'custom' && selectedFilters.customBudget !== ''
          ? Number(selectedFilters.customBudget)
          : null
      const request = buildSidequestRequest({
        preferences,
        username: getUsername(user, email),
        location:
          selectedFilters.where === 'any'
            ? 'Anywhere'
            : selectedFilters.where || 'Not selected',
        time: {
          selection: getTimeSelection(selectedFilters.time),
          customMinutes,
        },
        budget: {
          selection: getBudgetSelection(selectedFilters.budget),
          customDollars,
        },
        distance: null,
        goals,
        vibePreferences: activeVibe?.preferences ?? null,
        time: describeTime(selectedFilters),
        budget: describeBudget(selectedFilters),
        distance: selectedFilters.distance === 'any'
          ? 'Any distance from current location'
          : selectedFilters.distance
            ? `Within ${selectedFilters.distance} ${selectedFilters.distance === '1' ? 'mile' : 'miles'} of current location`
            : 'Not selected',
      })
      const serializedRequest = serializeSidequestRequest(request)
      setRequestJson(serializedRequest)

      if (isSignedIn && user) {
        const saved = await saveSidequestRequest(user.id, email, request)
        setRequestCount(saved.requestCount)
        setPersistenceMessage('Request saved to your account sidequest history.')
      } else {
        setPersistenceMessage('Sign in to save this request to your sidequest history.')
      }
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : 'Could not prepare the sidequest request.',
      )
    } finally {
      setIsLoadingPreview(false)
    }
  }

  return (
    <div className="space-y-5">
      {activeVibe && (
        <div
          className="flex items-start justify-between gap-3 rounded-xl border-l-2 px-4 py-3"
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
        className="rounded-2xl border p-4 sm:p-5"
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
          autoLocate={isSignedIn === true && !activeVibe}
          value={selectedFilters.where}
          onChange={(where) => setSelectedFilters((current) => ({ ...current, where }))}
        />
        <TimeButton
          value={selectedFilters.time}
          customValue={selectedFilters.customTime}
          onChange={(time) => setSelectedFilters((current) => ({ ...current, time }))}
          onCustomChange={(customTime) =>
            setSelectedFilters((current) => ({ ...current, customTime }))
          }
        />
        <BudgetButton
          value={selectedFilters.budget}
          customValue={selectedFilters.customBudget}
          onChange={(budget) => setSelectedFilters((current) => ({ ...current, budget }))}
          onCustomChange={(customBudget) =>
            setSelectedFilters((current) => ({ ...current, customBudget }))
          }
        />
      </div>
      <SidequestMeButton onClick={() => void showSidequestRequest()} />
      <SidequestJsonModal
        isOpen={isPreviewOpen}
        isLoading={isLoadingPreview}
        requestJson={requestJson}
        errorMessage={previewError}
        persistenceMessage={persistenceMessage}
        requestCount={requestCount}
        onClose={() => setIsPreviewOpen(false)}
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
              value={selectedFilters.time}
              customValue={selectedFilters.customTime}
              onChange={(time) => setSelectedFilters((current) => ({ ...current, time }))}
              onCustomChange={(customTime) =>
                setSelectedFilters((current) => ({ ...current, customTime }))
              }
            />
          </div>
          <div className="min-w-0 space-y-2">
            <span className="block text-xs font-medium" style={{ color: colors.muted }}>
              Budget
            </span>
            <BudgetButton
              value={selectedFilters.budget}
              customValue={selectedFilters.customBudget}
              onChange={(budget) => setSelectedFilters((current) => ({ ...current, budget }))}
              onCustomChange={(customBudget) =>
                setSelectedFilters((current) => ({ ...current, customBudget }))
              }
            />
          </div>
          <div className="min-w-0 space-y-2">
            <span className="block text-xs font-medium" style={{ color: colors.muted }}>
              Distance
            </span>
            <DistanceButton
              value={selectedFilters.distance}
              onChange={(distance) => setSelectedFilters((current) => ({ ...current, distance }))}
            />
          </div>
        </div>
      </section>
      <SidequestMeButton onClick={() => void showInputPreview()} />

      {isPreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsPreviewOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quest-input-preview-title"
            className="max-h-[min(85vh,48rem)] w-full max-w-xl overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              color: colors.foreground,
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: colors.secondary }}
                >
                  Test preview
                </p>
                <h2 id="quest-input-preview-title" className="mt-1 text-xl font-semibold">
                  Sidequest inputs
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="min-h-10 cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  borderColor: colors.border,
                  color: colors.secondary,
                  outlineColor: colors.secondary,
                }}
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed" style={{ color: colors.muted }}>
              This shows the current information for testing. No AI request is sent yet.
            </p>
            {isLoadingPreview ? (
              <p role="status" className="mt-5 text-sm" style={{ color: colors.muted }}>
                Loading your saved preferences and goals...
              </p>
            ) : previewError ? (
              <p role="alert" className="mt-5 text-sm" style={{ color: colors.error }}>
                {previewError}
              </p>
            ) : preview ? (
              <dl className="mt-5 space-y-3">
                <PreviewItem label="Location" value={preview.location} />
                <PreviewItem label="Time" value={preview.time} />
                <PreviewItem label="Budget" value={preview.budget} />
                <PreviewItem label="Distance" value={preview.distance} />
                {preview.vibeName && <PreviewItem label="Selected vibe" value={preview.vibeName} />}
                <PreviewItem
                  label="Vibe preferences"
                  value={preview.vibePreferences || 'None selected'}
                />
                <PreviewItem
                  label="General preferences"
                  value={preview.preferences || 'None saved'}
                />
                <div
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border }}
                >
                  <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.secondary }}>
                    Goals
                  </dt>
                  {preview.goals.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                      {preview.goals.map((goal, index) => <li key={`${goal}-${index}`}>{goal}</li>)}
                    </ul>
                  ) : (
                    <dd className="mt-2 text-sm" style={{ color: colors.muted }}>None saved</dd>
                  )}
                </div>
              </dl>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border }}
    >
      <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.secondary }}>
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {value}
      </dd>
    </div>
  )
}

export default QuestFilterButtons
