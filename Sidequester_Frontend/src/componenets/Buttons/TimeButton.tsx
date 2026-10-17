import { colors } from '../../constants/colors'

type TimeButtonProps = {
  value: string
  onChange: (value: string) => void
}

const options = [
  { value: 'any', label: 'Any time' },
  { value: '30', label: '30 minutes or less' },
  { value: '60', label: '1 hour or less' },
  { value: '120', label: '2+ hours' },
]

function TimeButton({ value, onChange }: TimeButtonProps) {
  return (
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
  )
}

export default TimeButton
