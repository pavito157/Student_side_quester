# Step 5: saved assignment and frontend handoff

Persistence and the API contract are implemented. The merged destination resolver
is now connected through `get_destination_resolver()` in
`backend/quests/quest_generation.py`.
New generation/save requests require `GOOGLE_PLACES_API_KEY` and a reviewed Gainesville city
boundary file at `GAINESVILLE_BOUNDARY_PATH`. Missing resolver configuration returns
503 before generation, without saving. Existing active assignments can be
loaded without calling Gemini or the resolver. Up to three independent quests can be active. See
[INTEGRATION_HANDOFF.md](INTEGRATION_HANDOFF.md) for current test evidence and the
frontend wiring contract.

Sidequest me now uses the merged full-page generation/detail interface. The
structured saved-assignment JSON is unchanged. Generate another lives on the
quest detail page and adds an independent quest without removing existing ones. Abandon, original
request details, map, and completion controls retain the frontend team's layout.
Pending generation is cancelled/reset when the signed-in account changes.

Backend branch integration keeps `firebase_config.py` as a compatibility shim for
the shared Firebase helpers. It uses ADC / GOOGLE_APPLICATION_CREDENTIALS rather
than a hardcoded service-account filename. The app registers each quest endpoint
once. Incoming unfinished `/users`, `/users/{user_id}` and `/leaderboard` routes
require verified Firebase authentication and return 501; they do not advertise a working feature.
`POST /test-firestore` is authenticated and read-only, returning connection status
and whether the existing test document exists without creating/overwriting it.

## Endpoints

All endpoints below require a verified **Firebase ID token** in the Bearer
header. Use the typed helper to obtain it; do not send a UID in request JSON.

| Endpoint | Success | Purpose |
| --- | --- | --- |
| `POST /quests/assign` | 201 | Generate and atomically save another quest, maximum three active |
| `POST /quests/{quest_id}/another` | 201 | Add a different activity while keeping the displayed quest active |
| `GET /me/active-quests` | 200 array | Reload all active quests and reconcile legacy alternatives |
| `POST /quests/{quest_id}/abandon` | 200 | Delete only the selected active quest without XP |
| `GET /me/quest` | 200 object or JSON `null` | Reload the most recent active assignment without Gemini |
| `POST /quests/generate` | 200 preview | Generate an unsaved draft; preserve verification flags |
| `POST /quests/preview` | 200 fixed preview | Original Step 3 transport test, moved from `/quests/assign` |
| `POST /quests/{quest_id}/steps/{step_index}/photo-proof` | 200 | Review an ephemeral JPEG/PNG/WebP photo for one photo-required step |
| `POST /quests/{quest_id}/steps/{step_index}/skip-photo-proof` | 200 | Skip an unavailable photo; completion is allowed but the quest/stop earns no XP |
| `POST /quests/{quest_id}/complete` | 200 | Transactionally complete a stop using its selected verification and award only eligible XP |

`/quests/generate` is intentionally public for unsaved guest previews. All saved
assignment, current-quest, completion, and abandon endpoints require a verified
Firebase ID token. Public deployments must apply edge rate limits and provider
quotas to the paid generation endpoint.

**Breaking endpoint change:** `/quests/assign` now returns the saved-assignment
contract, not the old fixed preview. `requestTestQuest` was updated to call
`/quests/preview`. The button, quick menu and detail pages use saved assignments.

Request example/schema: `contracts/assignment.request.example.json` and
`assignment.request.schema.json`. The request accepts the same preferences,
location, time, budget, distance, goals and vibe fields as generation, plus
optional `originCoordinates` and `multiQuest` (defaults to false), and `proofOptions`
(defaults to `["location"]`). Select one or both XP verification options
(`location`, `photo`) or select `recreation` by itself. Recreation is fun-only,
requires no evidence and earns no XP. Gemini may assign different enabled
methods to individual steps. Coordinates of the selected search origin are
required when `distance` is non-null. Defaults/time/budget meanings are unchanged.
When `multiQuest` is true, `originCoordinates` is required and generation gives
Gemini a diverse pool of verified candidates, then saves an ordered route of
two to ten distinct destinations (maximum 10). Each destination must have at
least one ordered action; multiple actions may share a stop. The
`stepDestinationIndexes` array maps every action to its zero-based route stop.
Stops are not forced to be nearest-first; each must contribute purposefully to
the mission. Actions and route length scale to the time, budget, and objective.
Each completed stop awards its share of saved XP when its action proofs are
eligible; recreation-only stops award no XP. Photo proof is an alternative to
location proof, is reviewed
by Gemini, and only accepted step indexes are retained. Image bytes are never
persisted. A user may skip a required photo when unable to take one; completing
that single-stop quest or multi-stop stop then awards no XP.

Response example/schema: `contracts/assignment.response.example.json` and
`assignment.response.schema.json`. The example is illustrative, not seeded data.

```text
quest:
  id, title, description, steps, locationName, placeId (string|null),
  latitude, longitude, radiusMeters, xpReward, isActive,
  estimatedMinutes, estimatedCostDollars, destinations, completedStops,
  stepProofMethods, verifiedPhotoSteps, skippedPhotoSteps
assignment:
  id, userId, questId, status="assigned", assignedAt (RFC3339 UTC),
  completedAt=null, xpAwarded=0
reusedExisting: boolean
```

`quest.id` matches `assignment.questId`. `assignment.id` is `{userId}_{questId}`.
The destination name/coordinates/place ID come from the resolver; Gemini's proposed
address is not included as trusted location data. `assignedAt` is generated by
the backend, stored as a Firestore timestamp, and serialized identically in JSON.
Assignment success occurs only after the transaction commits. No XP balance is
awarded by generation or assignment; the saved reward is credited only when the
quest is completed. Time/cost remain validated estimates.
For single-stop assignments, `destinations` and `completedStops` are empty
arrays. Multi-stop assignments persist the ordered verified destinations and
sequentially completed zero-based stop indexes.

The authenticated image endpoint accepts a raw image body with `Content-Type`
`image/jpeg`, `image/png`, or `image/webp`, capped at 5 MiB. The backend checks
the signature and step assignment, sends the image to Gemini for structured
review, then stores only `verifiedPhotoSteps` on acceptance. Rejected images
are not stored. `skip-photo-proof` records only the skipped step index. The
completion transaction requires accepted or skipped status for each photo step;
skipping forfeits the single quest's XP, or the current multi-stop stop's XP.
Location proof still uses fresh GPS. Photo and recreation methods do not require
GPS; recreation is always fun-only and cannot earn XP.

`reusedExisting: false` accompanies new assignments (HTTP 201). Read endpoints
set it to true for already saved quests. Each POST creates an independent quest;
it does not replace or return an unfinished quest. A fourth active quest returns
429. The optional legacy `assignment.replacementCount` is no longer a quota.

## Frontend helpers

Import from `src/services/questAssignment.ts`:

```ts
import { requestAssignedQuest, getActiveQuests } from './services/questAssignment'
import type { GenerateQuestPayload, SavedQuestResponse } from './services/questAssignment'

// On page load / account change:
const active = await getActiveQuests(firebaseUser.uid, { signal })
// active is SavedQuestResponse[] (0–3). Each quest.id opens its own detail page.

// When the student requests a quest:
const saved = await requestAssignedQuest(firebaseUser.uid, payload, {
  signal,
  onTiming: (timing) => console.table(timing), // optional
})
// Render saved.quest; use saved.quest.id for completion.
```

Helpers check the signed-in account before fetching and validate IDs, timestamps,
destination fields, assigned state and zero awarded XP in the returned JSON.
They preserve `QuestApiError.status` / `.detail` for actionable errors. The Sidequest me button is wired to the saved-assignment helper and displays
the returned quest and response JSON.

Frontend teammates can use the response example as a **mock fixture** to build
rendering immediately. There is no backend bypass that saves a fabricated or
unverified destination while waiting for the real resolver.

After resolver integration, test in the signed-in frontend's browser console:

```js
const { firebaseAuth } = await import('/src/configs/FirebaseConfig.ts');
const { requestAssignedQuest, getActiveQuests } = await import('/src/services/questAssignment.ts');
const payload = {
  preferences: 'I enjoy programming and nature.',
  location: 'Anywhere',
  time: { selection: '60', customMinutes: null },
  budget: { selection: '0', customDollars: null },
  distance: null,
  goals: ['Learn Computer Science'],
  vibePreferences: 'Something relaxed'
};
const assigned = await requestAssignedQuest(firebaseAuth.currentUser.uid, payload, {
  onTiming: (timing) => console.table(timing)
});
console.log(assigned);
console.log(await getActiveQuests(firebaseAuth.currentUser.uid));
```

This save test writes a real assignment to the configured project once the
resolver is connected. Repeating it creates another quest until three are active.
For reloading without generation, use `getActiveQuests`. The Step 4 preview
generates an unsaved quest and does not consume an active slot.

## Quest XP and configurable policy

XP is calculated by the backend from Gemini's validated `estimatedMinutes`:
5 XP per 15 minutes, rounded up, with a 5 XP minimum and 50 XP maximum. Neither
Gemini nor the browser supplies an XP value. The computed reward is stored as
`quest.xpReward` in the user's sidequest and the completion transaction awards
that stored value exactly once.

The remaining root `.env` policy setting applies to newly saved quests:

```dotenv
QUEST_RADIUS_METERS=100
```

Radius must be finite and positive; the default applies if omitted. Existing
saved quests keep their stored reward/radius. Completion's independent accuracy
limit defaults to 50 meters.

## Persistence and concurrency

Generated quests now live at **`Users/{uid}/sidequests/{quest.id}`**. The user UID
comes from the verified Firebase ID token; the client cannot choose the owner.
Each document combines Gemini-generated quest fields and assignment fields
(without either public `id` field), plus `ownerId`, `source: "gemini"`, server
`createdAt`, and the validated submitted JSON under `userRequest`. Keeping the
request nested preserves the original inputs without letting them overwrite
Gemini's title, description, steps, reward, or resolver-verified destination.
`questId` equals the child document ID. The public response remains unchanged:
`{quest, assignment, reusedExisting}`, including `quest.xpReward`.
`assignment.id` remains the API identifier `{uid}_{questId}` for compatibility;
it is not the child document ID. Use `response.quest.id` for detail-page links.
The request object includes submitted preferences and, when provided, the
selected origin coordinates. It never includes authentication tokens or API keys.

Assignment creation atomically creates that document and updates the user's
`activeQuestId` compatibility pointer. The active collection is authoritative.
Competing creators serialize on the user document and recheck the three-quest
limit before committing. External providers run outside transactions. Assignment
creation does not change XP or dorm balances.

Existing active global `userQuests`/`quests` assignments migrate on the next
`GET /me/quest` or assignment request, within a transaction. The old assignment is
marked `migrated` and the quest content copied under the user; no XP changes.
Completed global records remain available as legacy history. Direct legacy
completion remains supported. Old frontend `status: prepared` request snapshots
are left untouched and excluded from active quests; they cannot earn server XP.
More than three active assignments, corrupt ownership or incomplete records fail
with 409. Global collections are no longer written for new generated quests.

The active list and detail page subscribe to this user subcollection and display
the generated title, description, steps, verified destination, estimates and XP.
There is no timed expiration of backend assignments. Completion gets a fresh
browser GPS reading and calls FastAPI. Following the latest main behavior, one
transaction deletes the completed assignment, clears its active pointer, and
awards user/dorm XP once. Replaying a deleted quest returns 404 without XP.
Abandon explicitly deletes only the selected active assignment without XP.
Generate another keeps all existing quests active. Completing or abandoning any
one frees a slot; the other quests remain viewable and actionable.

The authenticated profile must exist. Assignment does not require dorm selection;
completion still requires a valid dorm and integer XP totals under the existing
completion policy. GPS only validates reported proximity, not performance of the
activity or protection against location spoofing.

## Error behavior and tests

401 token invalid/missing; 403 unverified email; 409 profile/current-state conflict or resolved
destination too far away; 422 invalid frontend input; 429 three active quests or Gemini quota; 502 invalid
generated content or failed destination resolution; 503 missing resolver, bad
policy or provider/database outage; 504 Gemini timeout. Failed saves never return
a fake assigned response. After a timeout/ambiguous network response, reload
`GET /me/active-quests` before retrying: a save may already have committed, and
another POST can create an additional quest.

Unit/API tests mock external Firebase verification/provider boundaries. Opt-in
emulator tests use loopback and `demo-sidequest-tests` with anonymous credentials,
unique document IDs and targeted cleanup. They exercise real transactions,
concurrent assignment creation, rollback after queued writes, privacy/ownership,
legacy recovery, and the real FastAPI save → reload → GPS complete → replay
rejection → next assignment cycle. No test creates production data.

```sh
python -m unittest discover -s backend/tests -q
# With a local Firestore emulator already running:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8787 python -m unittest discover -s backend/tests -q
cd Sidequester_Frontend
node --experimental-vm-modules --test tests/*.test.mjs
npm run build
npm run lint
```

## Backend teammate deployment handoff

Before exposing production saved assignments, review deployed Firestore rules.
No rules configuration was present in this checkout and none was deployed here.
Direct client writes must not modify `activeQuestId`, XP totals, quests or
assignments; private generated quests/assignments must only be readable by their
owner. Preserve the existing own-user preferences/goals/vibes permissions. Admin
SDK transactions bypass client rules, so emulator transaction tests do not prove
those deployed access rules are correct. Coordinate this with Backend 1 rather
than replacing their rules blindly.

## Merged frontend compatibility

The request accepts `distance: {"maxDistance": 2, "unit": "miles"}` or the
legacy numeric miles value, and nullable `vibePreferences`. Distance must be
positive. Include `originCoordinates: {"latitude": ..., "longitude": ...}`
from the selected place/device when requesting a distance limit. An address
string alone does not enable the distance check. The location controls now retain these coordinates and the button includes them
when available; selecting Anywhere clears them.

`xp` is authoritative on `Users` and `dorms`. For older records lacking `xp`,
backend transactions read `totalXp` and write the resulting balance to `xp`.
Profile setup backfills `xp` without resetting existing balances. Legacy fields
are retained, but ignored when `xp` exists. Client request-history writes no
longer write balances; frontend balance reads support legacy records too.

New saved assignments still require the teammate destination resolver. Completion
also requires a chosen dorm and a seeded dorm document with an integer XP balance.

Production now discovers a verified city/distance-eligible Google place before
Gemini writes activity content. No eligible result in the sampled search returns
409 before generation/saving. Public request/saved-response JSON is unchanged;
see `INTEGRATION_HANDOFF.md` for the current order and live test results.

## Three independent active quests

`POST /quests/{quest.id}/another` accepts the same preferences as `/quests/assign`
and returns HTTP 201 with `{quest, assignment, reusedExisting: false}`. Use the
currently displayed `quest.id`, not `assignment.id`. The source must still be
active both before generation and in the final transaction, otherwise HTTP 409.
The deprecated `/quests/{quest.id}/replace` route delegates to this same
non-destructive behavior for older callers.

Both creation paths enforce three **total** active quests per user, before paid
provider calls and again at commit. When full, HTTP 429 explains that completing
or abandoning a quest frees a slot. Failures do not delete/skip previous quests,
award XP or consume a slot. Concurrent calls can fill available slots but cannot
exceed three. This is an active-assignment limit, not a daily prompt quota.

`GET /me/active-quests` returns an array of saved-assignment response objects.
The frontend calls it on account load, then subscribes to
`Users/{uid}/sidequests` across all routes. Quick-menu cards each open their own
`/sidequests/{quest.id}` page with the description, complete step list, original
request, verified destination/map, reward, Complete and confirmed Abandon controls.

For profiles created under the previous replacement workflow, the first active
lookup restores the two most recent skipped ancestors leading to a currently
active quest, up to three total, and sets `activeQuestSchemaVersion: 2` atomically.
This migration runs once; it never recreates deleted completed/abandoned quests,
and later abandonment does not resurrect older alternatives. The legacy
`replacementCount` response field remains readable but does not restrict slots.

Gemini receives the selected source quest's title/description/steps to request a
different primary activity. Exact repeated description and steps are rejected
with 502. Semantic uniqueness or different destinations are not guaranteed.

Manual check: generate three quests. Return to the board and open Quick menu;
expect three cards (3/3). Select each to inspect its own contents and steps.
Refresh and confirm all remain. A fourth generation must return 429. Abandon
one: only its card disappears, XP stays unchanged, and one generation slot opens.
Complete another at its destination: only that quest disappears and user/dorm XP
increase once by its stored reward. Other quests remain available.
