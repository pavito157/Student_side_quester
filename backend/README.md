# SideQuest quest validation and completion

The saved-assignment API, frontend helpers, examples and integration boundary are
in [TASK5_API.md](TASK5_API.md). `POST /quests/assign` saves a verified assignment
or reuses the active one; `GET /me/quest` reloads it. New saves require the
configured verified destination resolver. `/quests/generate` is an unsaved preview
available to guests and signed-in users; guest previews are never persisted. It can
optionally generate a verified two- or three-stop route when `multiQuest` is true,
which requires an explicit origin. Public deployments should enforce edge rate
limits and provider quotas for this paid generation endpoint. The original fixed
test moved to `/quests/preview`; GET/completion routes and frontend integration
are implemented.

See [AUTH_SETUP.md](AUTH_SETUP.md) for Clerk-to-Firebase sign-in and
[TASK4_GEMINI.md](TASK4_GEMINI.md) for backend-only Gemini configuration. The
canonical profile collection is `Users`. JSON contracts live in [contracts](contracts/README.md).

## What is available

The checked-out repository originally contained a React/Vite frontend shell
(header and sidebar), with no backend application, Firebase helpers, or schema.
The remote `backend` branch also contained only the initial README and ignore file.
These modules use the supplied quest router and validation draft, preserving their
camelCase fields and collection names. No live Firestore schema was available to
inspect or migrate.

- `quest_validation.py` contains dependency-free Haversine and completion checks.
  It can be tested while FastAPI startup is unresolved.
- `quest_routes.py` contains the supplied GET/completion routes and uses the
  shared authentication/database helpers in `firebase_helpers.py`.
- `leaderboard_routes.py` exposes authenticated individual and dorm XP
  leaderboards. Individual balances come from `Users/{uid}` (`xp`, with legacy
  `totalXp` read compatibility). Dorm scores are recomputed from those user
  balances grouped by each profile's `dormId`.
- `dorm_catalog.py` contains the UF residence list supplied for this feature,
  including the `Off campus` category. `dorm_routes.py` returns the catalog and
  lets the authenticated user save their own residence; selection creates the
  corresponding Firestore `dorms/{dormId}` XP record when it does not exist.
- `quest_completion.py` owns the Firestore completion transaction.
- `quest_assignment_routes.py` mounts fixed/Gemini previews and saved/current
  assignment endpoints. `quest_persistence.py` owns atomic assignment creation.
- `quest_generation.py` owns direct Gemini generation and the resolver interface.

The frontend still needs to switch its leaderboard view to these backend
endpoints. Quest completion remains a separate transaction and continues to
update both a user's XP and the stored dorm total.

## Leaderboards

Both leaderboard endpoints require a valid Firebase ID token:

- `GET /leaderboard` returns `{"leaderboard": [{"userId", "username", "xp"}],
  "skippedUsers": n}`. A non-empty `username` is preferred; `displayName` is
  used when username is absent. Profiles without either display name are
  counted in `skippedUsers`.
- `GET /leaderboard/dorms` returns
  `{"leaderboard": [{"dormId", "dormName", "xp", "memberCount"}],
  "unassignedUsers": n}`. Each score is the sum of the XP balances of users
  whose stored `dormId` matches a document in `dorms`. Dorms with no members
  remain on the board with zero XP. Missing, malformed, and unknown dorm IDs
  are counted in `unassignedUsers`.

`xp` is canonical; legacy `totalXp` is read only when `xp` is absent, following
the shared `backend/xp.py` contract. Invalid XP data or Firestore read failures
return HTTP 503 rather than a partial ranking. These endpoints scan the user
collection on each request; consider a trusted, transactionally maintained
aggregate or caching strategy if the user base grows substantially.

`GET /me/dorm` returns the signed-in user's current `dormId`/`dormName` and the
configured catalog. `PUT /me/dorm` accepts only `{"dormId": "<catalog ID>"}`;
the ID is derived from the catalog entry, never from a user-provided name or UID.
The frontend prompts new profiles to select a hall or `Off campus` before using
the app and provides the same selector under Settings → Residence.

## Test without application startup

From the repository root, with only Python installed:

```sh
python3 -m unittest backend.tests.test_quest_validation -v
```

For router tests and Firestore emulator tests, create a local virtual environment
and install the dependencies (use Python 3.11+ for ongoing SDK support):

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m unittest discover -s backend/tests -v
```

Without `FIRESTORE_EMULATOR_HOST`, the transaction integration tests are explicitly
skipped. Route tests use an isolated FastAPI test app and mocked Firebase token
verification; they do not prove live Firebase authentication works.

Start the official Firestore emulator on loopback using your Firebase CLI setup,
then run:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8787 .venv/bin/python -m unittest backend.tests.test_quest_completion_emulator -v
```

Use your emulator's actual port. The tests reject non-loopback emulator hosts,
use `demo-sidequest-tests` with anonymous credentials, create unique test records,
and delete only their own records. They never use a real project or service key.
Tests cover duplicate simultaneous completions, separate users sharing a dorm,
replay, current quest settings, missing records, and rejected requests leaving
assignment/user/dorm data unchanged.

Validation result: all 37 tests passed (17 pure validation, 11 router/auth boundary,
9 Firestore integration) using the official Firestore emulator 1.22.0, Firebase
Admin 7.7.0, Firestore Python client 2.27.0, FastAPI 0.128.8, and Python 3.9.6.
The installed Python emitted SDK support warnings; use Python 3.11+ for development.

## Connect to the teammate's app

Mount this router from the existing application:

```python
from backend.quest_routes import router

app.include_router(router)
```

Run imports from the repository root. `get_firebase_app()` reuses an initialized
default Firebase Admin app, otherwise initializes with Application Default
Credentials on the first authenticated request. `get_db()` caches its client.
If teammate helpers become available, import those in `quest_routes.py` instead
of keeping two implementations. Neither module initializes credentials or starts
FastAPI on import.

Keep service account files outside the repository. If using a service account
locally, set `GOOGLE_APPLICATION_CREDENTIALS` to its external path; never put key
contents into code. `.gitignore` also excludes common Firebase key filenames and
local environment files. For production, ensure no emulator environment variables
are set and use the intended Firebase project's credentials.

## Complete a quest

```http
POST /quests/quest-id/complete
Authorization: Bearer <Firebase ID token>
Content-Type: application/json

{"latitude":29.65,"longitude":-82.34,"accuracy":10}
```

`accuracy` is the browser geolocation accuracy in meters. The JSON body accepts
only these three fields. Authentication verifies the Firebase ID token with
revocation checking and requires `email_verified` plus the exact `ufl.edu` email
domain. UID comes exclusively from those verified claims.

Coordinates must be finite numbers in their latitude/longitude ranges, accuracy
must be positive, and it must not exceed the server's limit (50m by default).
Set `MAX_LOCATION_ACCURACY_METERS` to a positive finite number to change that limit.
Proximity requires `distance + accuracy <= radiusMeters`. The decision uses full
precision; only diagnostic response distances are rounded. Reported location and
accuracy are client assertions and do not establish protection against spoofing.

The service reads these records **inside the transaction**:

| Document | Fields read |
| --- | --- |
| `Users/{uid}/sidequests/{questId}` | `userId`, `questId`, `status`, `isActive`, `latitude`, `longitude`, `radiusMeters`, `xpReward` |
| `Users/{uid}` | `dormId`, `xp` |
| `dorms/{dormId}` | `xp` |

Older global `userQuests`/`quests` records remain readable for compatibility; new
generated assignments use the user subcollection. Active legacy records migrate
transactionally when retrieved (see [TASK5_API.md](TASK5_API.md)).

The assignment must belong to the caller, refer to this quest, and have status
`assigned`. The quest must still be active. The user's dorm comes from the stored
profile. User and dorm records must already exist with nonnegative integer
`xp`; the reward must be a nonnegative integer. No client-provided reward,
destination, radius, identity, or dorm participates in completion.

After all reads and checks, one commit deletes the active assignment, removes the
user's `activeQuestId` when it points to that quest, and adds the stored reward to
both XP totals. The delete and XP updates are atomic. Firestore retries conflicted
transactions, including all checks; a duplicate request finds no assignment and
cannot award XP again. A successful commit followed by a lost HTTP response also
leaves no active assignment; clients can refresh `/me/quests`.

`POST /quests/{quest_id}/abandon` deletes the authenticated user's active
assignment and clears its pointer without awarding XP. Both completion and
abandonment remove new user-subcollection documents from `Users/{uid}/sidequests`.

Success returns `valid`, `reason`, `distanceMeters`, `accuracyMeters`,
`radiusMeters`, `questId`, `status`, and `xpAwarded`. Rejected location checks
return 400 with validation detail; missing quest/assignment returns 404; an
assignment belonging to someone else returns 403; conflicting state or incomplete
XP/profile configuration returns 409. Invalid JSON fields/types return 422.

This guarantee relies on assignment records and XP being writable only through
trusted server paths. Existing Firestore client security rules and assignment
code must prevent clients from resetting completion state or editing XP; no
deployed rules were present here to verify. Live credentials, deployed rules,
real ID tokens, and the teammate's full app startup remain separate integration
checks.

References: [Firebase transactions](https://firebase.google.com/docs/firestore/manage-data/transactions),
[ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore).
# Gemini integration (Step 4)

See [TASK4_GEMINI.md](TASK4_GEMINI.md) for the authenticated `/quests/generate`
preview, backend-only key setup, catalog requirements, frontend helper, and tests.
The fixed Step 3 endpoint is preserved. Neither preview saves assignments or XP.
