import { useEffect, useRef, type ReactNode } from 'react'
import { colors } from '../constants/colors'
import { CloseIcon } from './icons'

interface SidebarModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

function SidebarModal({ isOpen, onClose, title, children }: SidebarModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    let closeTimer: number | undefined

    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.classList.add('is-closing')
      closeTimer = window.setTimeout(() => {
        dialog.close()
        dialog.classList.remove('is-closing')
      }, 220)
    }

    return () => {
      if (closeTimer !== undefined) window.clearTimeout(closeTimer)
    }
  }, [isOpen])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sidebar-modal-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="sidebar-modal w-[min(88vw,24rem)] border p-0 shadow-2xl"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        color: colors.foreground,
      }}
    >
      <section className="flex h-full flex-col">
        <header
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: colors.border }}
        >
          <h2 id="sidebar-modal-title" className="text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: colors.muted, outlineColor: colors.primary }}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </dialog>
  )
}

export default SidebarModal
