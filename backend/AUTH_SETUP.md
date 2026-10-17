# Clerk to Firebase identity bridge (step 2)

The Clerk sign-in UI remains in place. A successful bridge keeps the Clerk user
ID verbatim as the Firebase Auth UID, so existing documents at `Users/{userId}`
and `Users/{userId}/vibes` stay at the same paths. No records are migrated or
deleted. The older completion helper now also reads `Users`, not lowercase
`users`. Any historical lowercase records require a separate reviewed migration;
this code does not silently combine their XP or identities.

## Configure and run locally

1. Install backend dependencies with Python 3.11+:
   `python -m pip install -r backend/requirements.txt`.
2. Copy the root `.env.example` to `.env` and fill in `CLERK_ISSUER` and
   `CLERK_SECRET_KEY` from the same Clerk instance used by the frontend's
   `VITE_CLERK_PUBLISHABLE_KEY`. The issuer is the HTTPS Frontend API origin
   (for example, `https://your-instance.clerk.accounts.dev`), not a publishable
   key, redirect URL, or your app's localhost URL. Do not copy the placeholder
   values into a deployed configuration.
3. Set `GOOGLE_APPLICATION_CREDENTIALS` to the external service-account JSON for
   the frontend's Firebase project (`studentsidequest`). Enable Firebase Auth in
   that project. The Admin credential must be able to manage Auth users, access
   Firestore, and sign custom tokens. With a service-account JSON, signing uses
   its private key; Google-managed credentials may additionally need the
   `iam.serviceAccounts.signBlob` permission.
4. Set `FRONTEND_ORIGINS` to comma-separated browser origins for CORS and Clerk
   token `azp` validation. Defaults cover localhost and 127.0.0.1 on port 5173.
   Add the actual origin if Vite switches ports, or the HTTPS deployment origin.
5. Start from the repository root:
   `python -m uvicorn main:app --reload --env-file .env`.
6. In the frontend's existing `.env.local`, add
   `VITE_API_BASE_URL=http://127.0.0.1:8000`. This is the default when omitted.
   Restart Vite after environment changes. For deployment it must point to the
   HTTPS backend. No Clerk secret, service account, or Gemini key belongs in a
   `VITE_` variable.
7. Sign in with an account whose **primary** Clerk email is a verified
   `@ufl.edu` email. A verified secondary UF address alone is not selected. The
   server rejects non-UF, unverified, banned, locked, and disabled accounts.

The frontend will now wait for the bridge before rendering the signed-in app.
Until this backend configuration is present, signed-in users see a connection
error with Retry and Sign out options. The existing signed-out page still works
without contacting the backend bridge. The root `/` and `/health` endpoints
continue to work without Clerk credentials. The fixed preview is at
`POST /quests/preview`. Gemini preview, saved/current assignment and GET/completion
routes are now mounted; see `TASK5_API.md` for the current handoff. New saved
assignments require the pending destination resolver.

## Authentication flow

1. The browser obtains its short-lived Clerk **session token**.
2. `POST /auth/firebase`, with `Authorization: Bearer <Clerk session token>` and
   body `{}`, verifies the RS256 signature using the configured issuer's JWKS,
   issuer, expiry/not-before/issued-at claims, session ID, and permitted `azp`.
   Pending sessions are rejected. Standard Clerk session tokens do not require
   an `aud`; this verifier instead pins the issuer, signature, session claims,
   and authorized browser origins. No token-supplied JWKS URL is used.
3. The server retrieves the user from Clerk's backend API using its secret and
   checks the primary email's verified status. Browser email/UID claims are not
   accepted as profile input. The body rejects extra fields.
4. Firebase Auth creates or updates the same UID with that verified UF email.
   Existing disabled users stay disabled. An email attached to a different
   Firebase UID returns 409 and requires explicit account linking; the bridge
   never guesses or merges identities by email.
5. A Firestore transaction fills **only absent** `displayName`, `createdAt`, and
   `totalXp` fields on `Users/{uid}`. Preferences, goals, vibes, XP, and dorm
   selection are preserved. A dorm is not fabricated. Completion still needs a
   valid dorm selected later.
6. The backend returns `{uid, firebaseCustomToken}` with `Cache-Control: no-store`.
   The browser exchanges this via Firebase `signInWithCustomToken`, verifies the
   UID matches Clerk, and obtains a Firebase **ID token**. The custom token is
   not an ID token and must not be used on the quest endpoints.
7. Future API calls use `getFirebaseIdToken(expectedUserId)` from
   `src/services/firebaseSession.ts`. `GET /auth/me` already verifies a Firebase
   ID token with revocation checking and returns `{uid}` to smoke-test this path.

There is no localStorage storage of bridge tokens. Firebase Auth uses in-memory
persistence and the SDK refreshes ID tokens. The bridge serializes account
switches/sign-out and cancels stale requests before allowing the signed-in UI to
mount. Clerk sign-out clears Firebase locally. This is not a promise of instant
server-side Firebase revocation when a Clerk session is revoked elsewhere;
Firebase session revocation and provider lifecycle synchronization are separate
concerns. The bridge performs no explicit global session revocation on logout.

## Firestore rules and existing data

No deployed Firestore rules were available in the repository, and none are
deployed by this change. Verify the project permits the user's Firebase UID to
read their own `Users/{uid}` document and manage their own `vibes` subcollection.
Profile client writes should be limited to `preferences` and `goals`; XP, profile
setup fields, quest assignments, and completions must be server-owned. Otherwise
direct client writes can bypass XP/assignment checks even though the API is
authenticated. Preserve any other teammate rules when making these changes.

The bridge does not create the lowercase `users` collection, reset missing dorms,
or automatically rewrite old assignment IDs. Existing Clerk user IDs remain the
canonical key. Server credentials and `.env` stay ignored; the committed
`.env.example` contains placeholders only.

## Frontend handoff: exact integration changes

- `src/configs/FirebaseConfig.ts`: exports `firebaseAuth` using the existing app.
- `src/main.tsx`: wraps `App` inside `FirebaseSessionBridge` under ClerkProvider.
- `src/auth/FirebaseSessionBridge.tsx`: waits for the matching Firebase session,
  with loading/error/retry/sign-out states during authentication only.
- `src/services/firebaseSession.ts`: performs the exchange and exports the ID
  token helper for future quest requests.
- `tests/firebaseSession.test.mjs`: isolated SDK/transport tests; no real keys.

No existing filters, preferences, vibes, goals, location UI, component layout,
Firebase project configuration values, or package dependencies are changed.
Teammates should keep this wrapper inside ClerkProvider and route future API
calls through the Firebase ID token helper instead of sending Clerk tokens to
quest endpoints.

## Verification

Backend: `python -m unittest discover -s backend/tests -v`. Clerk signature tests
use generated RSA keys and real JWT verification with mocked provider calls.
With `FIRESTORE_EMULATOR_HOST=127.0.0.1:<port>`, integration tests additionally
verify profile preservation, new profile creation, and profile initialization
racing XP completion against the real local Firestore emulator.

Frontend, from `Sidequester_Frontend`:

```sh
npm run build
npm run lint
node --experimental-vm-modules --test tests/firebaseSession.test.mjs
```

The session tests mock Firebase and HTTP while executing the actual TypeScript
service after transpilation. They exercise account binding, sign-out, rejected
accounts, stale requests, and StrictMode cancellation; they do not replace a
live browser sign-in test. Live Clerk/Firebase integration and deployed rules
remain unverified until the project configuration above is supplied and tested.

References: [Clerk JWT verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification),
[Firebase custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens).
