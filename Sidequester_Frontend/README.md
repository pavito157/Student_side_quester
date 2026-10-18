# Sidequester frontend

React, TypeScript, Vite, Tailwind CSS, Clerk, and Firebase client application.

## Project structure

- `src/app/` - application-level types and setup
- `src/components/` - shared navigation and decorative components
- `src/features/` - feature-owned pages, components, and UI
- `src/services/` - API, Firebase, and browser integrations
- `src/types/` - shared domain types

## Google Places setup

Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_MAPS_API_KEY` to a
Google Maps API key. Enable Maps JavaScript API, Places API (New), Geocoding
API, and Routes API. Detail and guest-preview maps use Routes for walking
directions to the first verified destination. Restrict the key to this app's
HTTP referrers and the APIs it uses; browser API keys are visible in the client
bundle.

The Where field uses Google Places autocomplete and biases suggestions toward
Gainesville, Florida. Its “Use my location” button requires browser location
permission and a secure context (HTTPS or localhost). Campus suggestions are
listed in `src/features/quest-generation/QuestFilterButtons.tsx`.

## Backend API

Set `VITE_API_BASE_URL` in `.env.local` when the backend is not running at
`http://127.0.0.1:8000`, then restart Vite. The leaderboard and quest flows use
the FastAPI backend; signed-in requests use the Firebase session bridge.

The dorm leaderboard sums XP for profiles with a valid `dormId` matching the
backend catalog. The catalog, including “Off campus,” is defined in
`backend/users/dorm_catalog.py`. New signed-in users are prompted to choose a
residence and can change it later under Settings → Residence.

## User preferences and goals

For signed-in users, general preferences are stored as plain text in the
`preferences` field of `Users/{Clerk user ID}`. Individual sidequest goals are
stored separately as a string array in that document's `goals` field. Both use
the Firebase client SDK; Firestore security rules are managed separately.
Saved vibes keep the selected place's coordinates with its label so applying a
vibe can restore the starting location and retain distance filtering. Existing
vibes without saved coordinates need their place selected again before using a
distance limit.

## Development

Run the app from this directory with `npm run dev`; use `npm run lint` and
`npm run build` for checks. Run the Node-based frontend tests with
`node --experimental-vm-modules --test tests/*.test.mjs`.
