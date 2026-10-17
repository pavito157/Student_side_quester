import { useState, type Dispatch, type SetStateAction } from 'react'
import { useUser } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import { buildSidequestRequest, serializeSidequestRequest } from '../../services/sidequestJson'
import { saveSidequestRequest } from '../../services/sidequests'
import { getUserGoals, getUserPreferences } from '../../services/userPreferences'
import type { BudgetConstraint, TimeConstraint } from '../../types/sidequest'
import type { Vibe } from '../../types/vibe'
import BudgetButton from '../Buttons/BudgetButton'
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
    <div className="space-y-3">
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
    </div>
  )
}

export default QuestFilterButtons
