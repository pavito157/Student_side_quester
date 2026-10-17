import { colors } from '../../constants/colors'

type SidequestMeButtonProps = {
  onClick: () => void
}

function SidequestMeButton({ onClick }: SidequestMeButtonProps) {
  return (
    <button
      type="button"
      className="min-h-12 w-full touch-manipulation rounded-lg px-5 py-3 text-base font-semibold transition hover:brightness-110 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      style={{
        backgroundColor: colors.primary,
        color: colors.primaryForeground,
      }}
      onClick={onClick}
    >
      Sidequest me
    </button>
  )
}

export default SidequestMeButton
