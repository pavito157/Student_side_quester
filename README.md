# Sidequester

Sidequester turns a user's available time, budget, and interests into verified
local adventures. The repository contains a React frontend and a FastAPI
backend.

## Project layout

- `Sidequester_Frontend/` - React, TypeScript, Vite, Tailwind, Clerk, and Firebase
  client application. See its [README](./Sidequester_Frontend/README.md) for
  environment setup.
- `backend/api/` - FastAPI route modules.
- `backend/auth/` - Firebase authentication and database helpers.
- `backend/quests/` - quest contracts, generation, destination resolution,
  persistence, proof, and completion.
- `backend/organizations/` - organization quest board logic.
- `backend/users/` - residence catalog and XP helpers.
- `backend/core/` - shared backend infrastructure.
- `backend/tests/` - backend unit and emulator tests.
- `backend/docs/` - API, authentication, generation, and integration guides.

`main.py` is the ASGI entry point. The root-level `auth.py`,
`firebase_config.py`, and `xp_service.py` are compatibility shims for existing
callers; new code should import from the backend packages.

## Development

Run the frontend from `Sidequester_Frontend/` with `npm install` and
`npm run dev`. Run frontend checks there with `npm run lint` and `npm run build`.
Backend setup, environment variables, API details, and test instructions are
documented in [backend/README.md](./backend/README.md).

Never commit Firebase credentials, API keys, or local environment files.
