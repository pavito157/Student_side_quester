import { colors } from '../../constants/colors'

type DistanceButtonProps = {
  value: string
  customValue: string
  onChange: (value: string) => void
  onCustomChange: (value: string) => void
}

const options = [
  { value: 'any', label: 'Any distance' },
  { value: '1', label: 'Within 1 mile' },
  { value: '5', label: 'Within 5 miles' },
  { value: '10', label: 'Within 10 miles' },
  { value: '25', label: 'Within 25 miles' },
  { value: 'custom', label: 'Custom distance…' },
]

function DistanceButton({ value, customValue, onChange, onCustomChange }: DistanceButtonProps) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Distance</span>
        <select
          aria-label="Distance"
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
            Distance
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
          <span className="sr-only">Custom distance in miles</span>
          <div className="relative">
            <input
              type="number"
              min="0.1"
              step="any"
              inputMode="decimal"
              aria-label="Custom distance in miles"
              placeholder="Maximum distance"
              value={customValue}
              onChange={(event) => onCustomChange(event.target.value)}
              className="min-h-11 w-full rounded-lg border py-2.5 pl-4 pr-14 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
                outlineColor: colors.primary,
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm"
              style={{ color: colors.muted }}
            >
              miles
            </span>
          </div>
        </label>
      )}
    </div>
  )
}

export default DistanceButton
