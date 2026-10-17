import { colors } from '../../constants/colors'
import type { SavedQuestResponse } from '../../services/questAssignment'

interface SidequestJsonModalProps {
  isOpen: boolean
  isLoading: boolean
  requestJson: string
  response: SavedQuestResponse | null
  errorMessage: string
  historyWarning: string
  onClose: () => void
  onGenerateAnother?: () => void
}

function SidequestJsonModal({
  isOpen, isLoading, requestJson, response, errorMessage, historyWarning, onClose, onGenerateAnother,
}: SidequestJsonModalProps) {
  if (!isOpen) return null

  function downloadResponse() {
    if (!response) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(response, null, 2)], {
      type: 'application/json',
    }))
    const link = document.createElement('a')
    link.href = url
    link.download = `sidequest-${response.quest.id}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sidequest-json-title"
        aria-busy={isLoading}
        className="rpg-dialog max-h-[min(85vh,48rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 sm:p-6"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          color: colors.foreground,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em]"
              style={{ color: colors.secondary }}
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary shadow-[0_0_10px_rgb(250_70_22_/_80%)]" />
              Request preview
            </p>
            <h2 id="sidequest-json-title" className="mt-1 text-xl font-semibold">
              {response ? response.quest.title : 'Sidequest request'}
            </h2>
          </div>
          <button
            type="button" onClick={onClose}
            className="min-h-10 cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-white/10"
            style={{ borderColor: colors.border, color: colors.secondary }}
          >
            Close
          </button>
        </div>

        {isLoading && (
          <p role="status" className="mt-5 text-sm" style={{ color: colors.muted }}>
            {response ? 'Generating a replacement; your current quest stays saved until it is ready…' : 'Preparing your request...'}
          </p>
        )}
        {response && (
          <div className="mt-4 space-y-4">
            <p role="status" className="text-sm" style={{ color: colors.success }}>
              {response.reusedExisting ? 'This is your current saved quest.' : 'Your quest is saved to your account.'}
            </p>
            <p className="leading-relaxed">{response.quest.description}</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <span>{response.quest.locationName}</span>
              <span>About {response.quest.estimatedMinutes} minutes</span>
              <span>{response.quest.estimatedCostDollars === 0 ? 'Free' : `Estimated $${response.quest.estimatedCostDollars}`}</span>
              <strong style={{ color: colors.secondary }}>+{response.quest.xpReward} XP on completion</strong>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              {response.quest.steps.map((step, index) => <li key={index}>{step}</li>)}
            </ol>
            <p className="text-xs" style={{ color: colors.muted }}>
              XP is awarded after successful completion, not when this quest is generated.
            </p>
            {onGenerateAnother && <div className="space-y-2">
              <button type="button" onClick={onGenerateAnother} disabled={isLoading}
                className="cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
                style={{ borderColor: colors.border, color: colors.secondary }}>
                {isLoading ? 'Generating…' : 'Generate another'}
              </button>
              <p className="text-xs" style={{ color: colors.muted }}>
                Uses your current filters. Replaces this quest and marks it skipped without awarding XP.
              </p>
            </div>}
            <button
              type="button" onClick={downloadResponse}
              className="cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-white/10"
              style={{ borderColor: colors.border, color: colors.secondary }}
            >
              Download response JSON
            </button>
            <details open>
              <summary className="cursor-pointer text-sm font-semibold">Response JSON</summary>
              <pre
                aria-label="Sidequest response JSON"
                className="mt-3 max-h-64 overflow-auto rounded-xl border p-4 text-xs leading-relaxed whitespace-pre-wrap break-words"
                style={{ backgroundColor: colors.background, borderColor: colors.border }}
              >
                {JSON.stringify(response, null, 2)}
              </pre>
            </details>
          </div>
        )}
        {requestJson && (
          <pre
            aria-label="Sidequest request JSON"
            className="mt-5 max-h-[50vh] overflow-auto rounded-xl border border-dashed p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words shadow-inner sm:text-sm"
            style={{
              backgroundColor: 'rgb(6 20 14 / 82%)',
              borderColor: 'rgb(213 196 134 / 30%)',
              color: colors.foreground,
            }}
          >
            {requestJson}
          </pre>
        )}
        {errorMessage && (
          <p role="alert" className="mt-4 text-sm" style={{ color: colors.error }}>{errorMessage}</p>
        )}
        {historyWarning && (
          <p role="status" className="mt-4 text-sm" style={{ color: colors.muted }}>{historyWarning}</p>
        )}
      </section>
    </div>
  )
}

export default SidequestJsonModal
