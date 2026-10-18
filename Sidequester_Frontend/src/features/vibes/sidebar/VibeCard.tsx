import { colors } from '../../../constants/colors'
import type { Vibe } from '../../../types/vibe'

interface VibeCardProps {
  vibe: Vibe
  onUse: (vibe: Vibe) => void
  onEdit: (vibe: Vibe) => void
}

function VibeCard({ vibe, onUse, onEdit }: VibeCardProps) {
  return (
    <li
      className="trail-vibe-card quest-tag border p-4"
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderLeftColor: colors.secondary,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate font-semibold">{vibe.name}</h3>
        <span
          className="vibe-card-stamp shrink-0 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: colors.background, color: colors.secondary }}
        >
          Vibe
        </span>
      </div>
      <p
        className="mt-1 line-clamp-2 text-sm"
        style={{ color: colors.muted }}
        title={vibe.preferences}
      >
        {vibe.preferences}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onUse(vibe)}
          className="vibe-use-action min-h-10 cursor-pointer px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            outlineColor: colors.primary,
          }}
        >
          Use vibe
        </button>
        <button
          type="button"
          onClick={() => onEdit(vibe)}
          className="vibe-edit-action min-h-10 cursor-pointer border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderColor: colors.secondary,
            color: colors.secondary,
            outlineColor: colors.secondary,
          }}
        >
          Edit vibe
        </button>
      </div>
    </li>
  )
}

export default VibeCard
