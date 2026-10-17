import { colors } from '../../constants/colors'

type BudgetButtonProps = {
  value: string
  onChange: (value: string) => void
}

const options = [
  { value: 'any', label: 'Any budget' },
  { value: '0', label: 'Free' },
  { value: '10', label: 'Under $10' },
  { value: '10-25', label: '$10–$25' },
]

function BudgetButton({ value, onChange }: BudgetButtonProps) {
  return (
    <label className="block">
      <span className="sr-only">Budget</span>
      <select
        aria-label="Budget"
        className="min-h-12 w-full cursor-pointer touch-manipulation rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          color: value ? colors.foreground : colors.muted,
          outlineColor: colors.primary,
        }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled hidden>
          Budget
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default BudgetButton
