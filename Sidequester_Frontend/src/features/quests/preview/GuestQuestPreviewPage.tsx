import Header from '../../../components/navigation/Header'
import SidequestMap, { type SidequestMapStop } from '../detail/SidequestMap'
import { colors } from '../../../constants/colors'
import { navigateTo } from '../../../services/navigation'
import type { GeneratedQuestResponse, GenerateQuestPayload } from '../../../services/questAssignment'

function GuestQuestPreviewPage({
  result,
  payload,
}: {
  result: GeneratedQuestResponse | null
  payload: GenerateQuestPayload | null
}) {
  const stops: SidequestMapStop[] = result?.destinations.map((destination, index) => ({
    name: destination.locationName,
    placeId: destination.placeId,
    latitude: destination.latitude,
    longitude: destination.longitude,
    step: result.quest.steps[index] ?? 'Explore this destination.',
    completed: false,
  })) ?? []

  return (
    <>
      <Header title="Quest preview" />
      <main className="min-h-[calc(100vh-4rem)] bg-gradient-glow px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-5xl space-y-5">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: colors.foreground, borderColor: colors.border, outlineColor: colors.secondary }}
          >
            <span aria-hidden="true">←</span>
            Back to Sidequester
          </button>

          <section
            role="status"
            className="rounded-xl border p-4 sm:p-5"
            style={{ color: colors.warning, borderColor: colors.warningBorder, backgroundColor: colors.warningBackground }}
          >
            <h2 className="font-bold">Guest preview — this quest was not saved</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: colors.foreground }}>
              Sign in to save a quest and track it. Only location- or photo-verified quest steps can award XP; recreation steps are for fun only.
            </p>
          </section>

          {result ? (
            <>
              <section className="rpg-panel p-5 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
                  {result.destinationVerified ? 'Verified quest preview' : 'Quest draft'}
                </p>
                <h1 className="mt-2 break-words text-3xl font-black leading-tight sm:text-5xl">
                  {result.quest.title}
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-relaxed sm:text-lg">
                  {result.quest.description}
                </p>
                <ol className="mt-6 space-y-3">
                  {result.quest.steps.map((step, index) => (
                    <li key={`${index}-${step}`} className="flex items-start gap-3 rounded-xl border p-4"
                      style={{ borderColor: colors.border, backgroundColor: colors.background }}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black"
                        style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}>
                        {index + 1}
                      </span>
                      <span className="pt-1 text-sm leading-relaxed">
                        {step}
                        <span className="mt-1 block text-xs font-semibold" style={{ color: colors.muted }}>
                          {result.quest.stepProofMethods[index] === 'photo'
                            ? 'Photo verification · XP eligible'
                            : result.quest.stepProofMethods[index] === 'location'
                              ? 'Location verification · XP eligible'
                              : 'Recreation · no verification or XP'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                    Estimated time: {result.quest.estimatedMinutes} minutes
                  </span>
                  <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                    Estimated cost: {result.quest.estimatedCostDollars === 0 ? 'Free' : `$${result.quest.estimatedCostDollars}`}
                  </span>
                  {result.quest.stepProofMethods.every((method) => method === 'recreation') && (
                    <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                      Recreation only · no XP
                    </span>
                  )}
                  <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                    {stops.length ? `${stops.length} verified stops` : `Suggested destination: ${result.quest.locationName}`}
                  </span>
                </div>
              </section>

              {stops.length > 0 && (
                <section className="rpg-panel overflow-hidden">
                  <div className="px-5 py-4 sm:px-6">
                    <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
                      Route map
                    </p>
                    <h2 className="mt-1 text-lg font-black">
                      {stops.length === 1 ? stops[0].name : `${stops.length} verified destinations`}
                    </h2>
                    <p className="mt-1 text-xs" style={{ color: colors.muted }}>
                      Stops are ordered for this quest. Hover or focus a pin to preview its step.
                    </p>
                  </div>
                  <SidequestMap
                    stops={stops}
                    origin={payload?.originCoordinates ?? null}
                  />
                </section>
              )}

              {!result.destinationVerified && (
                <p role="status" className="rounded-xl border p-4 text-sm leading-relaxed"
                  style={{ color: colors.warning, borderColor: colors.warningBorder, backgroundColor: colors.warningBackground }}>
                  The destination could not be verified, so this draft has no route map and should not be used as directions.
                </p>
              )}
            </>
          ) : (
            <section className="rpg-panel p-6">
              <h1 className="text-xl font-bold">Guest preview unavailable</h1>
              <p className="mt-2 text-sm" style={{ color: colors.muted }}>
                This preview is not saved. Generate another quest from the Sidequester home page.
              </p>
            </section>
          )}
        </div>
      </main>
    </>
  )
}

export default GuestQuestPreviewPage
