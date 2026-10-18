# Global quests

Global quests are organization events that users can add to one of their three personal quest slots.
Both user XP and residence XP are awarded once per event, in the same Firestore transaction
as the attendance record. Repeated and concurrent check-ins cannot award twice.

## Access and storage

- `Organizations/{organizationId}`: `name`, `isActive`, `adminUserIds` (Firebase/Clerk bridge UIDs).
- `GlobalQuests/{eventId}`: event title, description, organization ID/name, canonical venue GPS,
  timezone-aware start/end, XP reward, radius, GPS accuracy, grace window, verification mode.
- `Users/{uid}/globalQuestCompletions/{eventId}`: immutable award receipt with event ID, UID,
  completion timestamp, organization ID, awarded XP. Exact GPS is not stored.

Run `python -m backend.scripts.seed_global_quest_admins` with backend credentials to grant
only the two requested test admins membership in `Organizations/campus-events`. This is an
explicit operator action, not a sign-in hook or a hardcoded runtime authorization bypass.
The existing member list is preserved. Revoking membership prevents publishing immediately.
The test organization is named Campus Events; its name can be edited by a trusted operator.

**Database rules are required:** browser writes to Organizations, GlobalQuests and attendance
receipts must be denied, including for admins. All operations use FastAPI with Firebase ID
tokens. `security/firestore-global-quests.rules` is a scoped migration from the project's
inspected development allow-all rules. It intentionally preserves unrelated legacy rules;
it is not a complete production security policy. Do not deploy blindly over newer rules.
Rule deployment requires explicit approval and a backup of the current release.

## API

All endpoints require the existing verified Firebase ID token in `Authorization: Bearer ...`.

- `GET /global-quests`: `{quests, organizations, defaults}`. Includes at most 50 events whose
  event/grace window has not ended; `completed` is private to the caller. `organizations`
  includes only active organizations the caller administers; no member list is exposed.
- `GET /global-quests/public`: unauthenticated map-safe event details for the same upcoming
  events. It omits attendance state, creator identity, and check-in policy.
- `POST /global-quests`: admin-only. Body example below. Returns 201 with the event JSON.
  Backend rechecks membership inside the publish transaction. Event end must be in the future
  and after start, within seven days. Frontend times are local, converted to UTC before POST.
- `POST /global-quests/{eventId}/check-in`: `{latitude, longitude, accuracy}` for GPS events.
  Uses server time on each transaction attempt; requires distance + GPS accuracy <= radius,
  and accuracy <= the saved maximum. Missing GPS: 422; too far/imprecise: 400;
  outside time/already checked in/missing residence: 409. Success:
  `{eventId, status: "completed", xpAwarded: 25, distanceMeters}`.

```json
{
  "organizationId": "campus-events",
  "title": "First GBM of the semester",
  "description": "Meet the organization and hear about upcoming projects.",
  "locationName": "Event venue selected from Places",
  "latitude": 29.649,
  "longitude": -82.348,
  "startsAt": "2026-10-18T22:00:00Z",
  "endsAt": "2026-10-18T23:00:00Z"
}
```

No arbitrary `userId`, `createdBy`, `xpReward`, radius, verification mode or timestamps of check-in are
accepted from the browser. Reward is always chosen by server configuration (25 XP by default),
never an organization admin. Supplying `xpReward` in creation JSON returns 422. Admins are responsible for the event/venue accuracy; this flow does not invoke
Gemini at publication time, restrict manually created events to the city boundary, or claim to verify the hosting organization's identity. Gemini creates shared instructions on first acceptance.
GPS reports are browser-provided, as with personal quests; they are not spoof-proof attendance.

## Configuration

In ignored root `.env`, also documented in `.env.example`:

- `GLOBAL_QUEST_DEFAULT_XP=25`
- `GLOBAL_QUEST_RADIUS_METERS=100`
- `GLOBAL_QUEST_MAX_ACCURACY_METERS=50`
- `GLOBAL_QUEST_GRACE_MINUTES=0` (before and after the scheduled window)
- `GLOBAL_QUEST_VERIFICATION_MODE=gps` (`honor` explicitly disables GPS; time is always checked)

Settings are snapshotted per event, so changes only affect newly published quests. Existing
rewards/windows are immutable through this first version of the API. No event editing/cancel
UI is included yet; a trusted database operator can remove an erroneous event. Invalid
configuration fails closed. There is no automatic XP expiry. Accepting an event reserves one personal slot.

## Team test checklist

1. Restart FastAPI after pulling; refresh the frontend. A supplied admin sees Create Global
   Quest near the bottom. A regular account sees the event feed but no creation control.
2. Publish an event using a selected venue, a window spanning now, and 25 XP. Another
   signed-in user sees the same event after Refresh events. No real event is pre-seeded.
3. Add the event to My quests and open its detail page. Check in at the venue with precise GPS during the window. Verify one +25 update to the
   user and dorm and one attendance receipt. Reload and retry: no second award.
4. Try outside the time window, far from the venue, denied GPS and poor accuracy: no XP.
5. Create a future event: it can be added early, but server check-in requires its scheduled window. Server rejects
   forged early requests regardless of the browser clock.
6. Call POST without auth (401), with a non-admin token (403), or with an extra UID/reward in
   check-in JSON (422). Direct client writes to protected paths must be denied by rules.
7. Existing personal quests, photo proof, three slots, preferences and vibes still work.

Automated tests: `python -m unittest backend.tests.test_global_quests -v`, with loopback
`FIRESTORE_EMULATOR_HOST` for transaction tests. Tests use anonymous credentials and
`demo-sidequest-tests`, never the real project. Frontend tests cover admin-only rendering,
authenticated requests, fresh GPS, denied GPS, and configuration-based honor check-in.

## Initial rollout (2026-10-17)

The two supplied admin memberships were written and read back successfully in the
`studentsidequest` project. With explicit user approval, the scoped rules were deployed.
Public REST reads returned 403 for Organizations, GlobalQuests and completion receipts;
legacy profile/vibe probe paths retained their prior policy (404 for absent documents).
Both admins' real feeds were read successfully (one organization, zero events, 25 XP default).
No real events were published and no real XP was awarded during validation.

Full validation: 253 backend tests (including real local Firestore transactions), 93 frontend
tests, production build and lint passed. Desktop guest UI and mobile width were checked.
Signed-in publishing/GPS should still be exercised by an admin in their browser using the
team checklist. The browser used for UI checks was a guest session.

## Unified campus board

The frontend now uses one Campus quest board. Scheduled events use attendance check-in,
while any existing reusable organization activities appear within the same panel under
Organization activities. There is one Refresh board action. Empty organization activity
feeds add no duplicate card or empty-state panel. Admin-only Create event quest publishes
straight to the event feed; it does not create a second organization activity or consume a
personal sidequest slot. The form displays the fixed attendance reward without an XP input.
The campus map uses the scheduled events returned from `GlobalQuests`, including each
event's stored `latitude`, `longitude`, `locationName`, and `xpReward`; reusable activities
remain a separate feed and are not substituted for event pins.

## Admin tiers

- **Regular admin**: a user ID in `Organizations/{orgId}.adminUserIds`. Can publish events
  only under those active organizations. Their event form contains only assigned options.
- **Explicit admin**: a user ID in `Organizations/_platform_access.explicitAdminUserIds`.
  Can publish under any active organization, create organizations, and grant/revoke regular
  admin membership. A platform access document is never treated as a publishing organization.
- **Member**: no admin access. Can browse events and check in normally.

The explicitly authorized rollout made `user_3KpQRFpXWJtJoOZLnxrdo7movV0` an explicit admin.
`user_3KnxdJw5EezulC4qR3fF1Lv3Mkc` remains a regular admin for Campus Events.
The previous regular-admin memberships are retained. Removing an organization-specific
membership does not remove an explicit admin's platform authority.

The event feed now includes `adminRole` (`member`, `regular_admin`, `explicit_admin`).
Only explicit admins see **Manage organizations**. There they can create an organization
and assign a regular admin by user ID after that user has signed in at least once.

New endpoints (existing Firebase bearer token required):

- `GET /organization-admin`: explicit-admin-only list including regular admin user IDs.
- `POST /organizations`: `{ "name": "Campus Club" }`, explicit admin only. New records
  start active, with no regular admins and `isPublic: false`. Events can still be published
  under them; `isPublic` controls the separate legacy reusable-activities board.
- `PUT /organizations/{orgId}/admins`: `{ "userId": "user_…", "action": "grant" }`
  or `"action": "revoke"`, explicit admin only. Grants require an existing user profile;
  revocation also works if a user profile was deleted.

Creating organizations, assigning access, and publishing events all read current roles
inside their Firestore transactions, so membership changes take effect without token
refresh or custom Firebase claims. No management endpoint can grant explicit-admin status.
Client-supplied role/member fields are rejected. The protected Organizations rules already
cover the platform-access document; no additional rules deployment was required.

Initial explicit admins are granted only by a trusted operator:
`python -m backend.scripts.grant_explicit_admin --user-id USER_ID`.
This script preserves other explicit admins; it is not invoked at login or startup.


## Shared event tasks and personal slots

`POST /global-quests/{eventId}/accept` uses the verified Firebase token and an empty
request body. Returns 201 with the existing `{quest, assignment, reusedExisting}`
JSON contract. See `contracts/global-event-assignment.response.example.json` for a
schema-validated example (illustrative event, not a published listing).

On first acceptance, Gemini receives only the public event title, description,
venue and times. A narrow JSON schema, low temperature and attendance-only prompt
limit creative tasks: arrive, attend, check in. The winning task list is cached in
`GlobalQuests/{eventId}.questTemplate`. All attendees reuse that exact list; no user
preferences, private data, credentials, or AI-selected reward enter the prompt.
Concurrent first acceptors may make more than one provider call, but only one
canonical template wins the transaction. Provider failures consume no slot. There
is no invented fallback presented as a real model result.

The server attaches authoritative event ID, GPS, time window, radius, proof methods
and fixed event XP to the response. The compatibility cost field remains zero; for
event quests the frontend displays **See event listing**, not a promise of free
admission. The event's published terms remain authoritative.

Saved at `Users/{uid}/sidequests/{questId}` alongside ordinary quests, with
`sourceGlobalEventId`, `eventStartsAt`, and `eventEndsAt`. Acceptance checks the
three-slot limit inside the existing transaction, including concurrent requests.
Repeated acceptance returns the existing assignment, even when all slots are full.
The Campus board offers **Add to my quests**, **View quest**, or **All 3 slots full**.
Detail view supports instructions, steps, directions and abandonment. Generating
personal variations from an event quest is disabled, so its shared tasks stay fixed.

Personal completion uses `POST /quests/{questId}/complete` as before, but the server
dispatches event quests to the canonical event's current GPS/time policy. It uses
the same attendance receipt as the older board check-in endpoint, awards user and
residence XP once, and deletes the accepted assignment to free the slot atomically.
Board check-in remains API-compatible and also frees any accepted copy. Completing
through both routes, abandoning/reaccepting, or replaying requests cannot award a
second event reward. A cancelled or rescheduled event is checked against its current
server record, not a stale personal copy.

Extra team checks:

1. Add one event using two accounts: compare their `quest.steps` arrays; they match.
2. Reload and use View quest: same saved ID and instructions; no new generation.
3. Fill all three slots with any mix of ordinary/event quests: adding a fourth fails.
4. Abandon an event: it frees a slot without XP; reaccept before completion is allowed.
5. Complete during the event at its venue: one +25 user and residence award, one claim,
   and one freed slot. A second check-in or later reaccept is rejected.
6. Test early, late, inaccurate/far GPS, a cancelled event and Gemini unavailable:
   no XP; failed generation creates no assignment.

Automated coverage: `backend.tests.test_event_quests` plus the existing completion,
capacity, and global-event suites. Provider responses are mocked; Firestore writes
run only against the local demo emulator. No production XP is used for tests.
