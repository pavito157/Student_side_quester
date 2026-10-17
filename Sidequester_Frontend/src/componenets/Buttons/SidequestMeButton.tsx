import { colors } from '../../constants/colors'

type SidequestMeButtonProps = {
  onClick: () => void
}

function SidequestMeButton({ onClick }: SidequestMeButtonProps) {
  return (
    <button
      type="button"
      className="magic-cta group inline-flex min-h-14 w-full cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black uppercase tracking-[0.12em] transition-all hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        backgroundColor: colors.primaryHover,
        borderColor: colors.primary,
        color: colors.primaryForeground,
        outlineColor: colors.primary,
      }}
      onClick={onClick}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5 transition-transform group-hover:rotate-12 group-hover:scale-125">
        <path
          d="m10 1.8 1.85 5.45L17.3 9.1l-5.45 1.85L10 16.4l-1.85-5.45L2.7 9.1l5.45-1.85L10 1.8Z"
          fill={colors.secondary}
        />
        <path
          d="m16 13 .9 2.1L19 16l-2.1.9L16 19l-.9-2.1L13 16l2.1-.9L16 13Z"
          fill={colors.secondary}
        />
      </svg>
      Roll for a sidequest
    </button>
  )
}

export default SidequestMeButton
