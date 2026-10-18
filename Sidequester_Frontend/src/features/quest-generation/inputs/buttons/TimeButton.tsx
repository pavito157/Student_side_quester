import { colors } from '../../../../constants/colors'

type TimeButtonProps = {
  value: string
  customValue: string
  onChange: (value: string) => void
  onCustomChange: (value: string) => void
}

const options = [
  { value: 'any', label: 'Any time' },
  { value: '30', label: '30 minutes or less' },
  { value: '60', label: '1 hour or less' },
  { value: '120', label: '2+ hours' },
  { value: 'custom', label: 'Custom minutes…' },
]

function TimeButton({ value, customValue, onChange, onCustomChange }: TimeButtonProps) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Time</span>
        <select
          aria-label="Time"
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
            Time
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
          <span className="sr-only">Custom time in minutes</span>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Custom time in minutes"
            placeholder="Minutes available"
            value={customValue}
            onChange={(event) => onCustomChange(event.target.value)}
            className="min-h-11 w-full rounded-lg border px-4 py-2.5 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              color: colors.foreground,
              outlineColor: colors.primary,
            }}
          />
        </label>
      )}
    </div>
  )
}

export default TimeButton
