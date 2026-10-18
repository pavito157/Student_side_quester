import Header from '../../../components/navigation/Header'
import { SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react'
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
    step: result.quest.steps.filter((_step, stepIndex) =>
      (result.quest.stepDestinationIndexes?.[stepIndex] ?? (result.destinations.length === 1 ? 0 : stepIndex)) === index,
    ).join('\n') || 'Explore this destination.',
    completed: false,
  })) ?? []

  return (
    <>
      <Header title="Quest preview" />
      <main className="min-h-[calc(100dvh-4rem)] bg-gradient-glow px-3 py-5 sm:px-6 sm:py-12">
        <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-5">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
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
              This one-time preview is not saved. Only accepted photo proof can award personal quest XP. GPS checks presence only; recreation steps are for fun.
            </p>
            <SignedOut>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: colors.foreground }}>
                Sign in before creating your next quest to save it and track your progress.
              </p>
            </SignedOut>
            <SignedIn>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: colors.foreground }}>
                You’re signed in now, but this preview remains unsaved. Create a new quest from the board to track it.
              </p>
            </SignedIn>
          </section>

          {result ? (
            <>
              <section className="rpg-panel min-w-0 p-4 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
                  {result.destinationVerified ? 'Verified quest preview' : 'Quest draft'}
                </p>
                <h1 className="mt-2 break-words text-3xl font-black leading-tight sm:text-5xl">
                  {result.quest.title}
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-relaxed sm:text-lg">
                  {result.quest.description}
                </p>
                <ol className="mt-5 space-y-3 sm:mt-6">
                  {result.quest.steps.map((step, index) => (
                    <li key={`${index}-${step}`} className="flex min-w-0 items-start gap-3 rounded-xl border p-3 sm:p-4"
                      style={{ borderColor: colors.border, backgroundColor: colors.background }}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black"
                        style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}>
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 pt-1 text-sm leading-relaxed">
                        {step}
                        <span className="mt-1 block text-xs font-semibold" style={{ color: colors.muted }}>
                          {result.quest.stepProofMethods[index] === 'photo'
                            ? 'Photo verification · XP eligible after acceptance'
                            : result.quest.stepProofMethods[index] === 'location'
                              ? 'Location check · presence only · no XP'
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
                      Stops are ordered for this quest. Select a pin to preview its steps.
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
              <section
                aria-label="What to do next"
                className="rpg-panel flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="min-w-0">
                  <h2 className="text-base font-bold">Ready for another adventure?</h2>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: colors.muted }}>
                    Go back to the quest board to adjust your plans or create another quest.
                  </p>
                </div>
                <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:w-auto sm:min-w-48">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button
                        type="button"
                        className="min-h-11 w-full cursor-pointer rounded-xl px-4 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          backgroundColor: colors.primary,
                          color: colors.primaryForeground,
                          outlineColor: colors.primary,
                        }}
                      >
                        Sign in for saved quests
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <button
                      type="button"
                      onClick={() => navigateTo('/')}
                      className="min-h-11 w-full cursor-pointer rounded-xl px-4 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        backgroundColor: colors.primary,
                        color: colors.primaryForeground,
                        outlineColor: colors.primary,
                      }}
                    >
                      Create a saved quest
                    </button>
                  </SignedIn>
                  <button
                    type="button"
                    onClick={() => navigateTo('/')}
                    className="min-h-11 w-full cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      borderColor: colors.border,
                      color: colors.foreground,
                      outlineColor: colors.secondary,
                    }}
                  >
                    Back to quest board
                  </button>
                </div>
              </section>
            </>
          ) : (
            <section className="rpg-panel p-4 sm:p-6">
              <h1 className="text-xl font-bold">Guest preview unavailable</h1>
              <p className="mt-2 text-sm" style={{ color: colors.muted }}>
                This preview is not saved. Generate another quest from the Sidequester home page.
              </p>
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="mt-4 min-h-11 w-full cursor-pointer rounded-xl px-4 py-2.5 text-sm font-bold sm:w-auto"
                style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
              >
                Return to quest board
              </button>
            </section>
          )}
        </div>
      </main>
    </>
  )
}

export default GuestQuestPreviewPage
