import { colors } from '../../constants/colors'

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
      className="quest-tag group flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        color: colors.foreground,
        outlineColor: colors.secondary,
      }}
    >
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed" style={{ color: colors.muted }}>
          {description}
        </span>
      </span>
      <img src="/art/cozy/pointer.png" alt="" aria-hidden="true" className="cozy-icon size-5" />
    </button>
  )
}

export default SettingsOptionButton
