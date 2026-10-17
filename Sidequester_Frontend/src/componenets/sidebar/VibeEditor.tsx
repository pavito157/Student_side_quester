import { useState, type FormEvent } from 'react'
import { colors } from '../../constants/colors'
import type { Vibe } from '../../types/vibe'
import BudgetButton from '../Buttons/BudgetButton'
import TimeButton from '../Buttons/TimeButton'
import WhereButton from '../Buttons/WhereButton'

export type { Vibe } from '../../types/vibe'

interface VibeEditorProps {
  onSave: (vibe: Omit<Vibe, 'id' | 'createdAt' | 'updatedAt'>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  vibeToEdit?: Vibe | null
}

function VibeEditor({
  onSave,
  onDelete,
  vibeToEdit,
}: VibeEditorProps) {
  const [name, setName] = useState(vibeToEdit?.name ?? '')
  const [preferences, setPreferences] = useState(vibeToEdit?.preferences ?? '')
  const [where, setWhere] = useState(vibeToEdit?.where ?? '')
  const [time, setTime] = useState(vibeToEdit?.time ?? 'any')
  const [customTime, setCustomTime] = useState(vibeToEdit?.customTime ?? '')
  const [budget, setBudget] = useState(vibeToEdit?.budget ?? 'any')
  const [distance, setDistance] = useState(vibeToEdit?.distance ?? 'any')
  const [customBudget, setCustomBudget] = useState(vibeToEdit?.customBudget ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setErrorMessage('')
    try {
      await onSave({
        name: name.trim(),
        preferences: preferences.trim(),
        where,
        time,
        customTime,
        budget,
        distance,
        customBudget,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save this vibe.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!vibeToEdit || !window.confirm(`Delete "${vibeToEdit.name}"? This cannot be undone.`)) {
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    try {
      await onDelete(vibeToEdit.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete this vibe.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form id="vibe-editor-form" onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
      <div
        className="rounded-xl border-l-2 px-4 py-3 text-sm leading-relaxed"
        style={{
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderLeftColor: colors.secondary,
          color: colors.muted,
        }}
      >
        Save a reusable vibe with preferences that fit it, like wanting relaxed, low-cost
        activities or chances to learn something new. Add any filters you want to remember, too.
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold" style={{ color: colors.secondary }}>
          Vibe name
        </span>
        <input
          autoFocus={!vibeToEdit}
          required
          maxLength={40}
          aria-label="Vibe name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Study break, Explore campus"
          className="min-h-12 w-full rounded-xl border px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            color: colors.foreground,
            outlineColor: colors.primary,
          }}
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold" style={{ color: colors.secondary }}>
          Preferences
        </span>
        <textarea
          required
          maxLength={240}
          rows={4}
          aria-label="Vibe preferences"
          value={preferences}
          onChange={(event) => setPreferences(event.target.value)}
          placeholder="e.g. I like relaxed, low-cost activities where I can learn something new."
          className="w-full resize-y rounded-xl border px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            color: colors.foreground,
            outlineColor: colors.primary,
          }}
        />
      </label>

      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-3 text-sm font-semibold" style={{ color: colors.secondary }}>
          Optional quest filters
        </legend>
        <div className="space-y-2">
          <span className="block text-xs font-medium" style={{ color: colors.muted }}>
            Where
          </span>
          <WhereButton autoLocate={false} value={where} onChange={setWhere} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <span className="block text-xs font-medium" style={{ color: colors.muted }}>
              Time
            </span>
            <TimeButton
              value={time}
              customValue={customTime}
              onChange={setTime}
              onCustomChange={setCustomTime}
            />
          </div>
          <div className="space-y-2">
            <span className="block text-xs font-medium" style={{ color: colors.muted }}>
              Distance from current location
            </span>
            <DistanceButton value={distance} onChange={setDistance} />
          </div>
          <div className="space-y-2">
            <span className="block text-xs font-medium" style={{ color: colors.muted }}>
              Budget
            </span>
            <BudgetButton
              value={budget}
              customValue={customBudget}
              onChange={setBudget}
              onCustomChange={setCustomBudget}
            />
          </div>
        </div>
      </fieldset>

      {errorMessage && (
        <p role="alert" className="text-sm" style={{ color: colors.error }}>
          {errorMessage}
        </p>
      )}

      <div
        className={`sticky bottom-0 -mx-5 -mb-5 border-t p-5 ${
          vibeToEdit ? 'grid grid-cols-2 gap-3' : ''
        }`}
        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
      >
        {vibeToEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSaving}
            className="min-h-12 cursor-pointer rounded-xl px-4 py-3 font-semibold transition-all hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: colors.error,
              color: colors.background,
              outlineColor: colors.error,
            }}
          >
            Delete vibe
          </button>
        )}
        <button
          type="submit"
          form="vibe-editor-form"
          disabled={isSaving}
          className="min-h-12 w-full cursor-pointer rounded-xl px-4 py-3 font-semibold transition-all hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            outlineColor: colors.primary,
          }}
        >
          {isSaving ? 'Saving...' : vibeToEdit ? 'Save changes' : 'Save vibe'}
        </button>
      </div>
    </form>
  )
}

export default VibeEditor
