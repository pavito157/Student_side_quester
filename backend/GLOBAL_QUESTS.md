# Global quests

Global quests are organization events, independent of the three personal quest slots.
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
  "endsAt": "2026-10-18T23:00:00Z",
  "xpReward": 25
}
```

No arbitrary `userId`, `createdBy`, radius, verification mode or timestamps of check-in are
accepted from the browser. Admins can choose a bounded 1–500 reward, or omit it to use the
server default. Admins are responsible for the event/venue accuracy; this flow does not invoke
Gemini, restrict the event to the city boundary, or claim to verify the hosting organization's identity.
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
configuration fails closed. There is no automatic XP expiry or personal-slot reservation.

## Team test checklist

1. Restart FastAPI after pulling; refresh the frontend. A supplied admin sees Create Global
   Quest near the bottom. A regular account sees the event feed but no creation control.
2. Publish an event using a selected venue, a window spanning now, and 25 XP. Another
   signed-in user sees the same event after Refresh events. No real event is pre-seeded.
3. Check in at the venue with precise GPS during the window. Verify one +25 update to the
   user and dorm and one attendance receipt. Reload and retry: no second award.
4. Try outside the time window, far from the venue, denied GPS and poor accuracy: no XP.
5. Create a future event: check-in stays disabled until its scheduled start. Server rejects
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
