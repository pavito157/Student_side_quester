import { useState, type Dispatch, type SetStateAction } from 'react'
import { useUser } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import { getUserGoals, getUserPreferences } from '../../services/userPreferences'
import type { Vibe } from '../../types/vibe'
import BudgetButton from '../Buttons/BudgetButton'
import DistanceButton from '../Buttons/DistanceButton'
import SidequestMeButton from '../Buttons/SidequestMeButton'
import TimeButton from '../Buttons/TimeButton'
import WhereButton from '../Buttons/WhereButton'

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
}

function describeTime(filters: QuestFilters): string {
  if (filters.time === 'any') return 'Any time'
  if (filters.time === '30') return '30 minutes or less'
  if (filters.time === '60') return '1 hour or less'
  if (filters.time === '120') return '2+ hours'
  if (filters.time === 'custom') {
    return filters.customTime ? `${filters.customTime} minutes (custom)` : 'Custom minutes not entered'
  }
  return 'Not selected'
}

function describeBudget(filters: QuestFilters): string {
  if (filters.budget === 'any') return 'Any budget'
  if (filters.budget === '0') return 'Free'
  if (filters.budget === '10') return 'Under $10'
  if (filters.budget === '10-25') return '$10–$25'
  if (filters.budget === 'custom') {
    return filters.customBudget ? `$${filters.customBudget} maximum (custom)` : 'Custom budget not entered'
  }
  return 'Not selected'
}

function QuestFilterButtons({
  filters: selectedFilters,
  setFilters: setSelectedFilters,
  activeVibe,
}: QuestFilterButtonsProps) {
  const { isLoaded, isSignedIn, user } = useUser()
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [preview, setPreview] = useState<QuestInputPreview | null>(null)

  async function showInputPreview() {
    setIsPreviewOpen(true)
    setIsLoadingPreview(true)
    setPreviewError('')
    setPreview(null)

    try {
      if (!isLoaded) throw new Error('Your account is still loading. Please try again.')

      const [preferences, goals] = isSignedIn && user
        ? await Promise.all([getUserPreferences(user.id), getUserGoals(user.id)])
        : ['', []]

      setPreview({
        location: selectedFilters.where === 'any'
          ? 'Anywhere'
          : selectedFilters.where || 'Not selected',
        preferences,
        vibeName: activeVibe?.name ?? '',
        vibePreferences: activeVibe?.preferences ?? '',
        goals,
        time: describeTime(selectedFilters),
        budget: describeBudget(selectedFilters),
        distance: selectedFilters.distance === 'any'
          ? 'Any distance from current location'
          : selectedFilters.distance
            ? `Within ${selectedFilters.distance} ${selectedFilters.distance === '1' ? 'mile' : 'miles'} of current location`
            : 'Not selected',
      })
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : 'Could not load the current quest inputs.',
      )
    } finally {
      setIsLoadingPreview(false)
    }
  }

  return (
    <div className="space-y-3">
      {activeVibe && (
        <div
          className="rounded-xl border-l-2 px-4 py-3"
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderLeftColor: colors.secondary,
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.secondary }}>
            Using vibe: {activeVibe.name}
          </p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: colors.foreground }}>
            {activeVibe.preferences}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <DistanceButton
          value={selectedFilters.distance}
          onChange={(distance) => setSelectedFilters((current) => ({ ...current, distance }))}
        />
      </div>
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
