import { PixelLeafIcon } from '../../../components/decor/AdventureDecor'

export default function QuestGenerationPlay() {
  return <div className="generation-play">
    <div className="generation-trail" aria-hidden="true">
      <span className="generation-trail-line" />
      <span className="generation-leaf"><PixelLeafIcon className="size-full" /><span className="leaf-footsteps">··</span></span>
      <span className="generation-finish">✦</span>
    </div>
    <p className="font-semibold text-sm">A little adventure is taking shape<span className="generation-dots" aria-hidden="true">…</span></p>
    <p className="text-xs text-muted mt-1">Your next “why not?” is on its way.</p>
  </div>
}
