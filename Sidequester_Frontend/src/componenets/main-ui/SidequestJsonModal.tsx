import { colors } from '../../constants/colors'

interface SidequestJsonModalProps {
  isOpen: boolean
  isLoading: boolean
  requestJson: string
  errorMessage: string
  persistenceMessage: string
  requestCount: number | null
  onClose: () => void
}

function SidequestJsonModal({
  isOpen,
  isLoading,
  requestJson,
  errorMessage,
  persistenceMessage,
  requestCount,
  onClose,
}: SidequestJsonModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sidequest-json-title"
        className="max-h-[min(85vh,48rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          color: colors.foreground,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em]"
              style={{ color: colors.secondary }}
            >
              Test JSON
            </p>
            <h2 id="sidequest-json-title" className="mt-1 text-xl font-semibold">
              Sidequest request
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderColor: colors.border,
              color: colors.secondary,
              outlineColor: colors.secondary,
            }}
          >
            Close
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed" style={{ color: colors.muted }}>
          This payload is prepared for a future backend. No backend request is sent.
        </p>
        {isLoading && (
          <p role="status" className="mt-5 text-sm" style={{ color: colors.muted }}>
            Preparing your sidequest request...
          </p>
        )}
        {requestJson && (
          <pre
            aria-label="Sidequest request JSON"
            className="mt-5 max-h-[50vh] overflow-auto rounded-xl border p-4 text-xs leading-relaxed whitespace-pre-wrap break-words sm:text-sm"
            style={{
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.foreground,
            }}
          >
            {requestJson}
          </pre>
        )}
        {persistenceMessage && (
          <p role="status" className="mt-4 text-sm" style={{ color: colors.success }}>
            {requestCount === null
              ? persistenceMessage
              : `${persistenceMessage} Request count: ${requestCount}.`}
          </p>
        )}
        {errorMessage && (
          <p role="alert" className="mt-4 text-sm" style={{ color: colors.error }}>
            {errorMessage}
          </p>
        )}
      </section>
    </div>
  )
}

export default SidequestJsonModal
