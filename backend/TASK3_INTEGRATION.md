# Task 3: authenticated quest transport preview

Step 5 moved this fixed test to `/quests/preview`; `/quests/assign` now saves an
assignment. The helper was updated. See [TASK5_API.md](TASK5_API.md) for current
saved/current/completion endpoints. Ownership notes below describe the original
Step 3 scope; the completion router has since been mounted.

Task 3 adds `POST /quests/preview` to the actual FastAPI app and a typed frontend
helper. It deliberately does not generate or save a quest. No existing frontend
components, button handlers, filters, styles, or UI layouts are edited.

## Ownership and teammate handoff

| Area | Integration boundary |
| --- | --- |
| This task | `backend/quest_assignment_routes.py`, preview contract/examples, `main.py` router registration, and `src/services/questAssignment.ts` |
| Frontend teammates | Wire their button to the helper and choose how to render loading, field errors, and the returned quest |
| Backend 1 | XP transactions and individual/dorm leaderboard work remain untouched |
| Shared later work | Gemini provider, trusted venue matching, assignment persistence, and full saved-quest/completion cycle |

The earlier `backend/quest_completion.py` already contains an atomic completion
and XP implementation. Backend 1 should review/reuse that work before writing a
second implementation. This task neither edits nor mounts that code. The older
GET/completion router remains separate and unmounted; do not infer a full quest
cycle from the new preview route.

Use the shared `backend/firebase_helpers.py` functions `current_uid`, `get_db`,
and `USERS` (`Users`, with a capital U) when integrating other backend routes.
Do not initialize a second default Firebase app or accept a UID from request JSON.
Only one handler should own `POST /quests/preview`: upgrade this handler when real
generation/persistence is ready rather than registering a duplicate route.

## Request and response

Send the frontend team's JSON, documented in `contracts/assignment.request.example.json`,
with `Authorization: Bearer <Firebase ID token>` and `Content-Type: application/json`.
Use the Firebase ID token, not a Clerk session token, custom token, or an API key.

The handler authenticates the student, validates the public request, calls
`payload.normalize()`, and returns the same illustrative quest for every input.
The response contains:

```json
{
  "mode": "test",
  "saved": false,
  "filtersApplied": false,
  "message": "Fixed integration preview. Inputs were validated, but the quest is not personalized or filtered. Nothing was saved and no XP was awarded.",
  "quest": {
    "title": "Take an outdoor observation break",
    "description": "A fixed test quest to verify the frontend-to-FastAPI connection.",
    "steps": ["Find a publicly accessible outdoor campus spot.", "Notice three interesting things around you.", "Write a short note about what you observed."],
    "locationName": "UF campus (illustrative; no destination selected)",
    "estimatedMinutes": 20,
    "estimatedCostDollars": 0
  },
  "normalizedPreferences": {}
}
```

The actual `normalizedPreferences` contains the validated input constraints; see
`contracts/assignment.preview.example.json` and `assignment.preview.schema.json`
for the complete example/schema. It omits `username` and never echoes a token.
Responses use `Cache-Control: no-store` because this diagnostic echo contains
the student's preference text.

There is intentionally no quest ID, assignment ID, XP reward, GPS destination,
completion button, or fabricated saved status. A fixed quest may not match the
requested time, budget, or distance: the filters are validated, **not applied**.
The UI must preserve the test/unsaved indication. This schema is separate from
the future `AssignQuestResponse` persisted-assignment schema.

| Status | Meaning |
| --- | --- |
| 200 | Valid, authenticated integration preview; never HTTP 201 at this stage |
| 401 | Missing/invalid/expired Firebase ID token |
| 403 | UF email requirement not met |
| 422 | Invalid input; `detail` contains FastAPI field-validation errors |
| 503 | Authentication provider temporarily unavailable |

No Firestore client is requested by this handler, no data is written, no XP is
awarded, and no Gemini call is made. The verified Firebase dependency can perform
its existing Firebase Auth revocation check; that is distinct from writing data.

## Frontend helper

The new `Sidequester_Frontend/src/services/questAssignment.ts` exports:

```ts
requestTestQuest(expectedUserId, payload, { signal })
```

It obtains the Firebase ID token using the existing auth helper, sends the
payload unchanged, and verifies the preview response flags and quest structure.
`expectedUserId` is used locally to check the signed-in identity; the helper does
not add it to JSON. It uses the same `VITE_API_BASE_URL` setting as the auth bridge
(default `http://127.0.0.1:8000`). `signal` is optional; the UI should cancel on
dialog close, unmount, or account changes and disable/reject duplicate clicks.

Catch `QuestApiError` to inspect `.status` and `.detail`, particularly 422 field
errors. Its message includes a short field-error summary. Network failures and
non-JSON responses have separate connection/configuration messages. Do not log
ID tokens or display the preview as an assigned/completable quest.

Before sending custom values, convert nonblank form strings into valid numbers.
Keep `time.selection: "120"` as 2+ hours; a non-null `distance` is numeric miles
and requires a specific location. No distance UI is introduced by this change;
the frontend team can send null until its control is available.

## Test on this machine without changing components

Keep FastAPI on port 8000 and Vite running. After signing in with a verified
primary UF account, open the frontend page's browser developer console and run:

```js
const { firebaseAuth } = await import('/src/configs/FirebaseConfig.ts');
const { requestTestQuest } = await import('/src/services/questAssignment.ts');
if (!firebaseAuth.currentUser) throw new Error('Sign in with your UF account first.');
const preview = await requestTestQuest(firebaseAuth.currentUser.uid, {
  preferences: 'I enjoy programming and being outdoors.',
  username: firebaseAuth.currentUser.displayName || '',
  location: '101 Museum Rd, Gainesville, FL 32603, USA',
  time: { selection: '60', customMinutes: null },
  budget: { selection: '0', customDollars: null },
  distance: null,
  goals: ['Learn Computer Science'],
  vibePreferences: 'Something relaxed'
});
console.log(preview);
```

Expected: a 200 network response and the fixed quest, with `mode: "test"`,
`saved: false`, and `filtersApplied: false`. Change time/budget/distance and
confirm only the normalized input echo changes, not the fixed quest. Change
custom minutes to a string or distance to a negative number to see validation.
This console check uses the existing session without printing its token.

`http://127.0.0.1:8000/docs` also shows the mounted endpoint and a complete
request example. Swagger's Authorize control needs a Firebase **ID** token for
this route; setting a Clerk token there will not authenticate quest requests.
Do not send a token in chat. `/docs` tests confirm the request, security scheme,
and preview response are present in the actual application's OpenAPI schema.

The normal button still opens its existing input preview until the frontend team
wires the helper. Reloading the app will not load a saved test quest, because
this checkpoint intentionally does not persist anything.

## Automated checks

From the repository root:

```sh
python -m unittest backend.tests.test_quest_assignment_routes backend.tests.test_quest_contracts -v
```

API tests use the real app/router/request/response validation, with Firebase token
verification mocked. They check authentication, UF gating, invalid inputs,
normalization, OpenAPI docs, and the absence of Firestore/completion calls.

From `Sidequester_Frontend`:

```sh
npm run build
npm run lint
node --experimental-vm-modules --test tests/firebaseSession.test.mjs tests/questAssignment.test.mjs
```

Helper tests execute the actual TypeScript service after transpilation, mocking
only token retrieval and HTTP. A browser session smoke test remains distinct from
these automated tests; no UI wiring or live authenticated preview request is
claimed by the helper tests alone.
