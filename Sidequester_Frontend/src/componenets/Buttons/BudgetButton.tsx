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
        className="min-h-12 w-full cursor-pointer touch-manipulation rounded-lg px-5 py-3 text-base font-semibold transition hover:brightness-110 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={{ backgroundColor: colors.accent, color: colors.accentForeground }}
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
