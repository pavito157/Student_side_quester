import { colors } from '../../constants/colors'

type DistanceButtonProps = {
  value: string
  onChange: (value: string) => void
}

const options = [
  { value: 'any', label: 'Any distance' },
  { value: '1', label: 'Within 1 mile' },
  { value: '5', label: 'Within 5 miles' },
  { value: '10', label: 'Within 10 miles' },
  { value: '25', label: 'Within 25 miles' },
]

function DistanceButton({ value, onChange }: DistanceButtonProps) {
  return (
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
  )
}

export default DistanceButton
