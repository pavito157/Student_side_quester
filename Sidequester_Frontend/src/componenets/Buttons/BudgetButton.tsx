import { colors } from '../../constants/colors'

type BudgetButtonProps = {
  value: string
  customValue: string
  onChange: (value: string) => void
  onCustomChange: (value: string) => void
}

const options = [
  { value: 'any', label: 'Any budget' },
  { value: '0', label: 'Free' },
  { value: '10', label: 'Under $10' },
  { value: '10-25', label: '$10–$25' },
  { value: 'custom', label: 'Custom budget…' },
]

function BudgetButton({ value, customValue, onChange, onCustomChange }: BudgetButtonProps) {
  return (
    <div className="space-y-2">
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
      {value === 'custom' && (
        <label className="block">
          <span className="sr-only">Custom budget in dollars</span>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm"
              style={{ color: colors.muted }}
            >
              $
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              aria-label="Custom budget in dollars"
              placeholder="Maximum budget"
              value={customValue}
              onChange={(event) => onCustomChange(event.target.value)}
              className="min-h-11 w-full rounded-lg border py-2.5 pl-8 pr-4 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
                outlineColor: colors.primary,
              }}
            />
          </div>
        </label>
      )}
    </div>
  )
}

export default BudgetButton
