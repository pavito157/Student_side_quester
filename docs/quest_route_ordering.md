# New quest substance and route ordering

Generation accepts 1–10 actions. Single-stop quests can contain one substantive
action; multi-stop still requires at least two destinations and an action at
every destination. Prompts favor the fewest meaningful stops and distinct,
experience-led activities rather than repeated theme words or filler gestures.
These instructions guide quality; offline tests do not prove live output is fun.

Gemini selects verified candidates and groups ordered actions by destination.
The backend then calculates the visit order, using the submitted origin and
verified provider coordinates. For at most ten stops, subset dynamic programming
minimizes the sum of straight-line distances along an open path (no assumed
return trip), subject to declared prerequisites. It does not use a walking-time
matrix and does not guarantee the shortest or fastest actual walking route.
Without an origin, the proposed activity order is retained. Existing public
multi-stop requests continue to require an origin.

The optional generation-only `routeDependencies` field contains `before`,
`after` and a concrete prerequisite `reason`. Indexes refer to positions in
Gemini's proposed route. They must follow that draft order. Self-dependencies,
out-of-range references, contradictory order and cycles are rejected. The
prompt requires an empty list unless there is a genuine prerequisite, such as
an artifact needed at another stop. Legacy output omitting the field is accepted.
Dependencies and completion-criterion bookkeeping are excluded from public
proposal serialization and saved quest documents.

Before persistence, the new-quest path remaps destination groups, their actions,
proof methods, stepDestinationIndexes, primary location fields, and the final
completion-criterion suffix together, then validates the resulting proposal.
Within-stop action order is preserved. No read, completion, photo-proof or
saved-quest endpoint invokes the ordering function. Existing or in-progress
quests are never reordered.

Markers and walking-path requests use canonical destination order. Guest and
saved previews associate actions using stepDestinationIndexes. External walking
directions include only remaining stops, starting from the last completed stop
or submitted origin. Long routes are split into contiguous sections of four
destinations (three intermediate waypoints) for mobile compatibility; unusually
long Place IDs fall back to coordinates so URLs stay within 2,048 characters.
Unknown origins are omitted from external links rather than fabricated.

Google documents these URL limits and notes that waypoint support varies by
product: https://developers.google.com/maps/documentation/urls/get-started

Regression fixtures use synthetic coordinates near NW 13th Street, not invented
venue claims. They verify backtracking reduction, exhaustive-reference distance
results, dependency constraints, unknown origins, within-stop order, proof-array
remapping, photo-proof gating, XP/progress, ten-stop support, one-step generation,
and consistent map/directions ordering and waypoint sections.
