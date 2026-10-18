import { useEffect, useRef, type ReactNode } from 'react'
import { colors } from '../../../constants/colors'
import { BackIcon, CloseIcon } from '../../../components/ui/icons'
import { PixelLeafIcon } from '../../../components/decor/AdventureDecor'

interface SidebarModalProps {
  isOpen: boolean
  onClose: () => void
  onAddVibe: () => void
  title: string
  children: ReactNode
  onBack?: () => void
  showAddVibe?: boolean
  isEditor?: boolean
}

function SidebarModal({
  isOpen,
  onClose,
  onAddVibe,
  title,
  children,
  onBack,
  showAddVibe = true,
  isEditor = false,
}: SidebarModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    let closeTimer: number | undefined

    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReducedMotion) {
        dialog.close()
      } else {
        dialog.classList.add('is-closing')
        closeTimer = window.setTimeout(() => {
          dialog.close()
          dialog.classList.remove('is-closing')
        }, 360)
      }
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
      className="sidebar-modal trail-map-panel rpg-dialog border p-0 shadow-2xl"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        color: colors.foreground,
      }}
    >
      <div className="trail-map-atmosphere" aria-hidden="true">
        <PixelLeafIcon className="trail-map-leaf trail-map-leaf-one" />
        <PixelLeafIcon className="trail-map-leaf trail-map-leaf-two" />
        <PixelLeafIcon className="trail-map-leaf trail-map-leaf-three" />
        <PixelLeafIcon className="trail-map-leaf trail-map-leaf-four" />
        <span className="trail-route trail-route-one" />
        <span className="trail-route trail-route-two" />
        <span className="trail-map-firefly trail-map-firefly-one" />
        <span className="trail-map-firefly trail-map-firefly-two" />
        <span className="trail-map-firefly trail-map-firefly-three" />
      </div>
      <section className="trail-map-shell flex h-full min-h-0 flex-col">
        <header
          className="trail-map-header flex shrink-0 items-center justify-between border-b px-5 py-4"
          style={{ borderColor: colors.border }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {onBack && (
              <button
                type="button"
                aria-label="Back to quick menu"
                onClick={onBack}
                className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-all hover:-translate-x-0.5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  color: colors.secondary,
                  borderColor: colors.border,
                  outlineColor: colors.secondary,
                }}
              >
                <BackIcon />
              </button>
            )}
            <h2 id="sidebar-modal-title" className="truncate text-xl font-semibold">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: colors.muted, outlineColor: colors.secondary }}
          >
            <CloseIcon />
          </button>
        </header>
        <div className={`trail-map-content min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-5 ${isEditor ? 'trail-map-editor-content' : ''}`}>
          <div className="trail-map-stamp" aria-hidden="true">
            <span className="trail-map-stamp-mark">✦</span>
            <span>{title === 'Quick menu' ? 'SATCHEL INVENTORY' : 'FIELD NOTES'}</span>
            <i />
          </div>
          {children}
        </div>
        {showAddVibe && (
          <div
            className="trail-map-footer mt-auto shrink-0 border-t p-5"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <button
              type="button"
              onClick={onAddVibe}
              className="trail-map-action min-h-12 w-full cursor-pointer rounded-xl px-4 py-3 font-semibold transition-all hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: colors.secondary,
                color: colors.secondaryForeground,
                outlineColor: colors.secondary,
              }}
            >
              <PixelLeafIcon className="trail-action-leaf size-5" />
              <span>Add vibe</span>
              <PixelLeafIcon className="trail-action-leaf trail-action-leaf-end size-5" />
            </button>
          </div>
        )}
      </section>
    </dialog>
  )
}

export default SidebarModal
