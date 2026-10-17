import { useState, type FormEvent } from 'react'
import { colors } from '../constants/colors'
import BudgetButton from './Buttons/BudgetButton'
import TimeButton from './Buttons/TimeButton'
import WhereButton from './Buttons/WhereButton'

export type Vibe = {
  id: string
  name: string
  description: string
  where: string
  time: string
  budget: string
}

interface VibeEditorProps {
  onSave: (vibe: Omit<Vibe, 'id'>) => void
  onDelete: (id: string) => void
  vibeToEdit?: Vibe | null
}

function VibeEditor({
  onSave,
  onDelete,
  vibeToEdit,
}: VibeEditorProps) {
  const [name, setName] = useState(vibeToEdit?.name ?? '')
  const [description, setDescription] = useState(vibeToEdit?.description ?? '')
  const [where, setWhere] = useState(vibeToEdit?.where ?? '')
  const [time, setTime] = useState(vibeToEdit?.time ?? '')
  const [budget, setBudget] = useState(vibeToEdit?.budget ?? '')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({ name: name.trim(), description: description.trim(), where, time, budget })
  }

  function handleDelete() {
    if (!vibeToEdit || !window.confirm(`Delete "${vibeToEdit.name}"? This cannot be undone.`)) {
      return
    }

    onDelete(vibeToEdit.id)
  }

  return (
    <form id="vibe-editor-form" onSubmit={handleSubmit} className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Name your vibe</span>
        <input
          autoFocus
          required
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Study break"
          className="min-h-12 w-full rounded-lg border px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            color: colors.foreground,
            outlineColor: colors.primary,
          }}
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">Describe the vibe</span>
        <textarea
          required
          maxLength={240}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What kind of sidequest are you in the mood for?"
          className="w-full resize-y rounded-lg border px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            color: colors.foreground,
            outlineColor: colors.primary,
          }}
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Vibe settings</legend>
        <WhereButton value={where} onChange={setWhere} />
        <TimeButton value={time} onChange={setTime} />
        <BudgetButton value={budget} onChange={setBudget} />
      </fieldset>

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
            className="min-h-12 cursor-pointer rounded-lg px-4 py-3 font-semibold transition hover:brightness-110 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2"
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
          className="min-h-12 w-full cursor-pointer rounded-lg px-4 py-3 font-semibold transition hover:brightness-110 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            outlineColor: colors.primary,
          }}
        >
          {vibeToEdit ? 'Save changes' : 'Save vibe'}
        </button>
      </div>
    </form>
  )
}

export default VibeEditor
