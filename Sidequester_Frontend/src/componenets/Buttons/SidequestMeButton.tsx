import { colors } from '../../constants/colors'

type SidequestMeButtonProps = {
  onClick: () => void
}

function SidequestMeButton({ onClick }: SidequestMeButtonProps) {
  return (
    <button
      type="button"
      className="min-h-12 w-full touch-manipulation rounded-lg border px-5 py-3 text-sm font-semibold transition-colors hover:brightness-110 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        backgroundColor: colors.primaryHover,
        borderColor: colors.primary,
        color: colors.primaryForeground,
        outlineColor: colors.primary,
      }}
      onClick={onClick}
    >
      Sidequest me
    </button>
  )
}

export default SidequestMeButton
