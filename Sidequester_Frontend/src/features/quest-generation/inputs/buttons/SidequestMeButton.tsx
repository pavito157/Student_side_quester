import { colors } from '../../../../constants/colors'

type SidequestMeButtonProps = {
  onClick: () => void
  isLoading?: boolean
  disabled?: boolean
}

function SidequestMeButton({ onClick, isLoading = false, disabled = false }: SidequestMeButtonProps) {
  return (
    <button
      type="button"
      disabled={isLoading || disabled}
      aria-busy={isLoading}
      className="magic-cta group inline-flex min-h-14 w-full cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-lg px-5 py-3 text-base font-semibold transition-all hover:brightness-110 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
      style={{
        backgroundColor: colors.primaryHover,
        borderColor: colors.primary,
        color: colors.primaryForeground,
        outlineColor: colors.primary,
      }}
      onClick={onClick}
    >
      <img src="/art/cozy/compass.png" alt="" aria-hidden="true" className="cozy-icon size-8 shrink-0" />
      <span className="text-center">{isLoading ? 'Finding your quest…' : 'Sidequest me'}</span>
      <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center">
        <img src="/art/cozy/navigation-arrow.svg" alt="" aria-hidden="true" className="cozy-icon size-5" />
      </span>
    </button>
  )
}

export default SidequestMeButton
