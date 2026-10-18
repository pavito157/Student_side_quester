import { useState } from 'react'
import { colors } from '../../constants/colors'
import type { DormOption } from '../../services/dorms'

type DormPickerProps = {
  dorms: DormOption[]
  selectedDormId: string | null
  isSaving: boolean
  errorMessage: string
  onSave: (dormId: string) => void
  submitLabel?: string
}

function DormPicker({
  dorms,
  selectedDormId,
  isSaving,
  errorMessage,
  onSave,
  submitLabel = 'Save residence',
}: DormPickerProps) {
  const [dormId, setDormId] = useState(selectedDormId ?? '')

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (dormId) onSave(dormId)
      }}
    >
      <div>
        <label
          htmlFor="residence-selection"
          className="mb-2 block text-sm font-semibold"
          style={{ color: colors.secondary }}
        >
          Your residence
        </label>
        <select
          id="residence-selection"
          value={dormId}
          onChange={(event) => setDormId(event.target.value)}
          disabled={isSaving}
          required
          className="min-h-12 w-full rounded-xl border px-3 py-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          style={{
            backgroundColor: colors.background,
            borderColor: colors.border,
            color: colors.foreground,
            outlineColor: colors.primary,
          }}
        >
          <option value="" disabled>Select your residence</option>
          {dorms.map(({ dormId: optionId, dormName }) => (
            <option key={optionId} value={optionId}>{dormName}</option>
          ))}
        </select>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: colors.muted }}>
        Your choice groups the XP you earn on the dorm leaderboard. You can change
        it later in settings. Choose “Off campus” if you don’t live in a UF hall.
      </p>
      <button
        type="submit"
        disabled={!dormId || isSaving}
        className="min-h-11 cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
      >
        {isSaving ? 'Saving…' : submitLabel}
      </button>
      {errorMessage && (
        <p role="alert" className="text-sm" style={{ color: colors.error }}>
          {errorMessage}
        </p>
      )}
    </form>
  )
}

export default DormPicker
