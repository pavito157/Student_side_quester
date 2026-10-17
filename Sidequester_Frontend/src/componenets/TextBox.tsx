import type { ReactNode } from 'react'
import { colors } from '../constants/colors'

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
      className="rounded-2xl border p-4 sm:p-5"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-sm font-semibold">
          {title}
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
        className="max-h-48 min-h-14 overflow-auto rounded-lg border p-3 text-xs leading-relaxed whitespace-pre-wrap break-words"
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
