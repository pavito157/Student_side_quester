import type { ReactNode } from 'react'
import { colors } from '../../constants/colors'

interface TextBoxProps {
  id: string
  title: string
  content: string
  caption?: ReactNode
  tone?: 'default' | 'error'
  action?: ReactNode
}

function TextBox({
  id,
  title,
  content,
  caption,
  tone = 'default',
  action,
}: TextBoxProps) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`rpg-panel p-5 sm:p-6 ${id === 'user-preferences' ? 'preferences-widget' : ''}`}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="widget-title">
          {id === 'user-preferences' && <img src="/art/cozy/settings.png" alt="" aria-hidden="true" className="cozy-icon preferences-icon" />}{title}
        </h2>
        {caption && (
          <span className="text-xs" style={{ color: colors.muted }}>
            {caption}
          </span>
        )}
      </div>
      <div
        aria-labelledby={`${id}-title`}
        aria-readonly="true"
        className="quest-subpanel max-h-48 min-h-24 overflow-auto p-4 text-sm leading-relaxed whitespace-pre-wrap break-words"
        role="textbox"
        tabIndex={0}
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
          color: tone === 'error' ? colors.error : colors.foreground,
        }}
      >
        {content}
      </div>
      {action && <div className="mt-3 flex justify-end">{action}</div>}
    </section>
  )
}

export default TextBox
