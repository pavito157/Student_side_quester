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
        className="min-h-12 w-full cursor-pointer touch-manipulation rounded-lg px-5 py-3 text-base font-semibold transition hover:brightness-110 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={{ backgroundColor: colors.secondary, color: colors.secondaryForeground }}
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
