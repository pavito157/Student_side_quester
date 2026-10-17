import { colors } from '../constants/colors'

type SettingsOptionButtonProps = {
  title: string
  description: string
  onClick?: () => void
  type?: 'button' | 'submit'
}

function SettingsOptionButton({
  title,
  description,
  onClick,
  type = 'button',
}: SettingsOptionButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 text-left transition-all hover:-translate-y-px hover:border-primary hover:bg-white/10 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        color: colors.foreground,
        outlineColor: colors.primary,
      }}
    >
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed" style={{ color: colors.muted }}>
          {description}
        </span>
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
        style={{ color: colors.muted }}
      >
        <path
          d="m7.5 4.5 5.5 5.5-5.5 5.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export default SettingsOptionButton
