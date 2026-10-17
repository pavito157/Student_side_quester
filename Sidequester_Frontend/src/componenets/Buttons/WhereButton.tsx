import { colors } from '../../constants/colors'

type WhereButtonProps = {
  value: string
  onChange: (value: string) => void
}

const options = [
  { value: 'reitz-union', label: 'Reitz Union' },
  { value: 'Marston', label: 'Marston Library' },
  { value: 'Libwest', label: 'Library West' },
  { value: 'Flavet', label: 'Flavet Field' },
  { value: 'Wauburg', label: 'Lake Wauburg' },
  { value: 'SouthWest', label: 'SouthWest Recreation Center' },
  { value: 'studentrec', label: 'Student Recreation Center' },
]

function WhereButton({ value, onChange }: WhereButtonProps) {
  return (
    <label className="block">
      <span className="sr-only">Where</span>
      <select
        aria-label="Where"
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
          Where
        </option>
        <option value="any">Anywhere</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default WhereButton
