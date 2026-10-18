# Sidequester handoff for Claude

Updated October 18, 2026 (America/New_York). This describes the current local checkout, not an assurance that changes are deployed.

## Start here

- Repository: `/Users/leeb/Student_side_quester`
- Current branch: `global-fixes`
- Current HEAD: `4f34ca1` — `Use Luis ambient video across app and restore leafy foliage`
- **There are important uncommitted navbar and leaderboard changes. Preserve them.** Do not reset, overwrite, or replace the checkout with a teammate's branch.
- Root `package-lock.json` is an unrelated, pre-existing untracked file. Leave it alone; do not include it in a feature commit by accident.
- Latest completed request: add Aarav's top-three podium/top-achievers presentation while matching our cozy RPG theme. Implementation and validation are complete locally; no commit or push was requested for these latest changes.
- Current user request is this context handoff. There is no additional authorized deployment or push pending.

## Product and user preferences

Sidequester is a gamified Gainesville adventure app: personal generated quests, campus/organization event quests, GPS/photo verification, XP, and student/residence leaderboards.

The user initially wanted a mostly modern interface, then explicitly approved a stronger **cozy RPG / Sprout Lands** direction. The current theme uses parchment panels, wooden frames, sage buttons, pixel headings and icons, foliage, and a playful animated background. The user is combining the best parts of teammates' UIs rather than replacing everything with one branch.

Important constraints:

- Preserve authentication, API contracts, GPS/photo proof, quest acceptance/completion/abandonment, XP and dorm XP, admin permissions, and the three-active-quest limit.
- No generated quest thumbnail/description illustrations. Small decorative sprites are wanted.
- Keep Google Maps native, with our pixel XP pins and live reward labels.
- Foliage stays anchored below the sticky navbar. Preserve its proximity reaction, smooth return/bounce, and leaf release on the initial bounce; leaf release positions vary across the relevant corner.
- Preserve button feedback, falling leaves, generation drumroll/confetti, and reduced-motion support.
- Keep main quest-form width aligned with the overall goals/preferences section.
- Welcome/hero is its own `/welcome` route, reachable from the centered Sidequester brand.
- Ask about material ambiguities instead of inventing product behavior. Proceed with already authorized work and routine implementation details.

## Git checkpoints and teammate integrations

Local commits already made:

1. `b8fa14a` — cozy RPG interface, selected kit/generated assets, journal cards, shared theme.
2. `f885c8c` — merge `origin/main` through `481b48d`.
3. `9c98498` — blend main's sidebar/header/settings animations into our theme; fix interrupted drawer close/reopen.
4. `4f34ca1` — Luis's dynamic background across the app and his foliage asset.

Teammate branch references at last fetch:

- `origin/Aarav-leaderboard`: `1fcbfcf5861a8969b14f92c4c403af1bed014b4b`
- `origin/luis_ui`: `73b4d51039231ca3f5f9837b0884dda6bcf24cbc`
- `origin/main`: `36e8b106caffe46f4fb8566cea7c7a6eb3db0654`

**Main has advanced beyond the last merged main commit.** Fetch/inspect before any future integration; do not claim the checkout is fully synchronized with current main.

### Main sidebar/animation integration (committed)

Kept main's responsive sidebar structure, scrolling editor and fixed footer, entrance/hover effects, animated header sprites, settings-journal entrance, fireflies, drifting leaves, and button-reactive sprigs. Applied our palette, fonts, frames, controls, and overlapping sprites. New lantern/mushroom/hanging-vine accents from main remain.

Key files:

- `Sidequester_Frontend/src/features/vibes/sidebar/SidebarModal.tsx`
- `Sidequester_Frontend/src/features/settings/SettingsModal.tsx`
- `Sidequester_Frontend/src/components/decor/AdventureDecor.tsx`
- `Sidequester_Frontend/src/index.css`
- `Sidequester_Frontend/tests/sidebarMotion.test.mjs`

Drawer remains fixed to the viewport. Its closing delay matches the 420ms animation. Reopening during close cancels the pending timer and removes the stale `is-closing` class. Escape/backdrop callbacks and reduced-motion close remain functional.

### Luis background/foliage integration (committed)

The user explicitly confirmed **whole app**, not just Luis's quest detail/preview pages.

- `src/components/decor/QuestVideoBackground.tsx` mounts once in `src/main.tsx`, separately from account/route state.
- Video: `public/art/gemini_generated_video_342ca554.mp4` (about 2.8 MB, 1280×720, ~10 seconds), imported from Luis's branch.
- Video loops muted, autoplay, plays inline, never intercepts input, and sits behind UI.
- Reduced-motion preferences prevent video rendering and respond to preference changes. Video/source errors remove the video; existing static garden remains as fallback.
- Navbar foliage now uses `/art/leafy-corner.png`, the asset Luis uses. Existing bounce and shedding handlers are retained.
- Luis's unrelated quest page layouts, scroll containers, and other styling were deliberately **not** imported.
- Tests: `tests/videoBackground.test.mjs`.

## Current uncommitted changes

### Navbar consistency

Modified `Sidequester_Frontend/src/components/navigation/Header.tsx`:

- Menu, settings, leaderboard, and guest account controls use equal square sizes: 40×40 px on desktop, existing responsive sizes on mobile.
- Removed leaderboard's visible desktop text; trophy icon remains, with accessible name and tooltip.
- On secondary pages, Quest board uses our map icon with accessible name/tooltip instead of a wider text button.
- Signed-in Clerk avatar gets the matching outer frame and a smaller avatar inside it.
- Existing navigation and auth callbacks are preserved.

### Aarav rank logic and podium

The branch uses an **older directory structure** (`src/componenets/main-ui/...`). Port logic into the current `src/features/leaderboard/` structure; do not revive the old misspelled component tree.

Files modified/added:

```text
Sidequester_Frontend/src/features/leaderboard/LeaderboardPage.tsx
Sidequester_Frontend/src/features/leaderboard/leaderboardTiers.ts
Sidequester_Frontend/src/features/leaderboard/leaderboardPresentation.ts
Sidequester_Frontend/src/index.css
Sidequester_Frontend/tests/leaderboardPage.test.mjs
Sidequester_Frontend/tests/leaderboardPresentation.test.mjs
Sidequester_Frontend/tests/leaderboardTiers.test.mjs
docs/leaderboard-ranks.md
```

Rank behavior:

| Minimum total XP | Tier |
| --- | --- |
| 0 | Iron |
| 50 | Bronze |
| 100 | Silver |
| 150 | Gold |
| 200 | Platinum |
| 250 | Diamond |
| 300 | Ascendant |
| 350 | Immortal |
| 400 | Radiant |

- Student and dorm rows derive tiers from existing total XP. No XP writes or backend schema changes.
- Bars show progress within the current 50-XP tier; Radiant remains full at/above 400 XP.
- Leaderboard placement is separate from XP tier. Top three places have Gold/Silver/Bronze placement labels.
- Signed-in student has a `YOU` label and highlight. Shows XP needed to strictly exceed the competitor above (`difference + 1`), including ties. First place has a leading-player message. No invented standing if current user is absent.
- API order/tie-breaker is preserved; no client re-sort by tier.
- Keep our current Firebase token exchange, validated API responses, loading/error/empty states, member counts, and stale-request cancellation.
- Aarav's page expected older optional diagnostics (`skippedUsers`, `unassignedUsers`). Current service does not expose them; rank display must **not** depend on them.

The user initially asked for logic only, then relaxed the restriction and requested the podium/top-achievers layout too. **Latest intent takes precedence:**

- Three featured top-achiever cards on desktop; stack on narrow screens.
- Students heading: `Top achievers`; dorms heading: `Top residence halls`.
- Uses `splitRankings`; remaining roster starts at place 4, with each competitor rendered exactly once.
- Partial podiums show only actual returned competitors. No empty roster section if there are no remaining rows.
- Retains our parchment/wood treatment, crown/trophy sprites, pixel typography, sage bars/highlights, and dynamic background.
- No import of Aarav's separate CSS palette, forest background, or dorm-emblem artwork.
- CSS near the end of `src/index.css`: `.leaderboard-body`, `.leaderboard-section-heading`, `.leaderboard-podium`, `.leaderboard-champion`.
- Desktop cards use flex columns with aligned progress areas; <=760px switches to stacked grid cards.

## Validation and current limits

Latest full frontend suite: **161 tests passed, 0 failures**.

From `Sidequester_Frontend`:

```sh
node --experimental-vm-modules --test tests/*.test.mjs
npm run build
npm run lint
```

The VM flag is required by these existing test fixtures. Without it, tests fail with `vm.SourceTextModule is not a constructor`.

- Latest production build succeeded after final CSS alignment.
- Lint has no errors. Existing unnecessary-escape warnings remain in `tests/globalQuests.test.mjs`; build has a chunk-size warning.
- Rank tests cover every tier boundary, max/invalid XP, tie/unsafe comparisons, current player, zero-XP dorms, tab switching, errors/empty/guest states, late response protection, partial podiums, and unique numbering across podium/roster.
- Visual checks: desktop and 390px-wide sample-data leaderboard, navbar sizes, sidebar/settings, welcome, global pin navigation.
- Populated leaderboard was rendered from the **real component with labeled sample data** via a temporary read-only server, not from production account writes. Do not present sample names/XP as real data.
- Live signed-in completion/GPS/admin actions were not exercised during these UI passes. No production XP/account changes were made.
- Temporary preview servers were stopped after checks. Vite was available at `http://localhost:5173`; inspect running state before assuming it remains available.
- Useful local logs: `/private/tmp/podium-tests.log`, `/private/tmp/podium-build.log`, `/private/tmp/podium-lint.log` (temporary, may disappear).

Screenshots (local, optional references):

```text
/Users/leeb/.codex/visualizations/2026/10/17/01a147e4-2176-7773-90f5-30de48caa77e/leaderboard-podium-preview.png
/Users/leeb/.codex/visualizations/2026/10/17/01a147e4-2176-7773-90f5-30de48caa77e/navbar-consistent.png
/Users/leeb/.codex/visualizations/2026/10/17/01a147e4-2176-7773-90f5-30de48caa77e/integrated-sidebar.png
```

## Assets/theme references

- Shared theme and integration notes: `docs/cozy-rpg-ui.md`.
- Production cozy assets: `Sidequester_Frontend/public/art/cozy/`.
- Selected Sprout Lands UI kit sprites/font by Cup Nooble, plus generated matching garden/canopy/icon artwork and native editable XP-pin SVG. Artist credit is in the board footer; license is `CUP-NOOBLE-LICENSE.txt` in the asset directory.
- Asset source ZIP supplied by user: `/Users/leeb/Downloads/Sprout Lands - UI Pack - Basic pack.zip`.
- The basic kit has noncommercial terms; preserve attribution/license and consult the actual license before commercial distribution.
- `index.css` has earlier designs plus appended cozy/integration overrides. Specificity matters; adding generic rules may not override main's more specific modal/sidebar selectors.

## Architecture and existing product decisions to preserve

- React/TypeScript/Vite frontend, FastAPI backend, Clerk sign-in, existing Firebase session/token bridge and Firestore persistence. Do not change auth providers/token setup as part of UI work.
- Personal quests are under `Users/{userId}/sidequests`; frontend subscribes to that collection.
- Maximum three active quests. Global/campus event acceptance consumes one of these slots.
- Global quest map shows campus/organization global quests, even when a user is at capacity. Capacity disables acceptance with an explanatory label; it must not hide available events.
- Admin-created event XP is server configured (25 default), not editable by the event creator. Event completion defaults to GPS verification during the scheduled event time; policy is configurable server-side.
- Global event data is in `GlobalQuests`; organization/admin permissions in `Organizations`. Existing server authorization and protected Firestore paths must remain.
- Regular admins manage events only for assigned organizations; explicit admins can create organizations and assign users, plus regular-admin capabilities.
- The previously designated explicit admin is `user_3KpQRFpXWJtJoOZLnxrdo7movV0`; the other original admin `user_3KnxdJw5EezulC4qR3fF1Lv3Mkc` remains organization-scoped. Inspect current data/code before changing permissions; don't automatically rerun seed/deployment writes.
- UF-email-only sign-in was intentionally removed for the hackathon. Do not restore a domain restriction.
- Quest generation verifies eligible destinations before Gemini writes quest content. Preserve GPS and XP contracts and dorm XP accounting.
- For backend integration detail, see `backend/docs/INTEGRATION_HANDOFF.md` and existing contract/docs rather than inferring from old screenshots.

## UF calendar midnight import: built, activation not confirmed

The user returned to automatic UF event imports recently. We inspected existing code and gave Ubuntu activation instructions; **we did not activate anything on the remote server**.

Files:

- `backend/uf_calendar.py`
- `backend/scripts/import_uf_events.py`
- `backend/UF_CALENDAR_IMPORT.md`
- `deploy/systemd/sidequester-uf-events.service`
- `deploy/systemd/sidequester-uf-events.timer`
- `docs/DEPLOYMENT.md`

Behavior:

- Official feed: `https://calendar.ufl.edu/live/ical/events`.
- Imports next 14 days by default, refreshing at **00:00 America/New_York** (EST/EDT automatically), not fixed UTC-5.
- Requires physical venue coordinates inside the configured reviewed Gainesville boundary, timezone-aware start/end, and official source URL.
- Rejects online/hybrid events, all-day/malformed events, missing coordinates, and out-of-city venues. No guessing/geocoding of missing coordinates.
- Stable occurrence IDs prevent duplicates. Updates preserve reward policy/claims. Explicitly ineligible imported occurrences are cancelled; manual events are not changed. Feed failures do not clear existing events.
- Import publishes event cards; it does not automatically assign personal slots. Existing acceptance/generation flow handles shared event quest instructions.
- User requested local-midnight refresh; server is Ubuntu. Website deployment alone does not enable the timer.

Documented server layout (verify against the actual host before using): `/opt/sidequester`, service user `sidequester`, `.venv`, root ignored `.env`.

```sh
cd /opt/sidequester
sudo -u sidequester .venv/bin/pip install -r backend/requirements.txt
# Read-only preview first:
sudo -u sidequester .venv/bin/python -m backend.scripts.import_uf_events
# Install scheduler and run an initial write import:
sudo cp deploy/systemd/sidequester-uf-events.service /etc/systemd/system/
sudo cp deploy/systemd/sidequester-uf-events.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start sidequester-uf-events.service
sudo systemctl enable --now sidequester-uf-events.timer
sudo systemctl list-timers sidequester-uf-events.timer
sudo journalctl -u sidequester-uf-events.service -n 30 --no-pager
```

Server `.env` needs readable `GAINESVILLE_BOUNDARY_PATH` and `GOOGLE_APPLICATION_CREDENTIALS` paths. Credentials must stay out of Git and chat. Existing deployment docs describe Firebase Hosting frontend plus Ubuntu/Tailscale backend; actual deployment access/state has not been verified during this handoff.

## Suggested continuation

1. Read `git status` and inspect current diffs before editing. Preserve the navbar change along with rank/podium work.
2. Ask what the user wants next; current podium work is complete, so don't invent a redesign or deployment.
3. If asked to save/push, stage only intended files, including new helpers/tests/docs; exclude unrelated root lockfile. Latest navbar/rank/podium changes are not committed/pushed yet.
4. If asked to integrate newer main, fetch and review carefully: main has advanced and UI regressions/conflicts are possible. Preserve all chosen theme/behavior decisions above.

## Latest update: advanced quest defaults

User clarified that “text” was a typo: no new verification method. New quests default to `proofOptions: ['location', 'photo']`; Recreation stays off. Multi-stop defaults OFF for unset/Any time or under 60 minutes, and ON for 60+ minutes, including custom time. Explicit checkbox choices take precedence over subsequent time changes via the frontend-only `multiQuestManual` flag; it is not sent in API payloads. Applying a vibe resets to the time-based default. Multi-stop still requires a starting location. Shared policy is in `features/quest-generation/questFilterDefaults.ts`. Changes are in `features/home/HomePage.tsx`, verification fallbacks in `features/quest-generation/QuestFilterButtons.tsx`, and related `questNavigation`/`questButton` tests. Full suite: 161 passing tests; production build succeeds. These changes are also uncommitted.

## Latest background update (after the leaderboard-defaults push)

The latest user request replaces the nonseamless MP4 with a recreated layered scene in the same pixel-art style. `src/components/decor/AmbientScene.tsx` now mounts in `src/main.tsx`; `QuestVideoBackground.tsx` and its obsolete tests are removed. New lossless WebP assets are under `public/art/ambient/`. Independent CSS cloud drift, dragon breathing/smoke, flames/embers and fireflies avoid any shared rewind; reduced-motion mode leaves a static scene. Header foliage interactions and app functionality remain intact. The MP4 is retained only for reference/rollback. See `docs/seamless-background.md` for prompts/provenance and loop design. Latest suite: 162 passing tests, successful build, no lint errors. This background replacement is local and uncommitted; `leaderboard-defaults` was previously pushed at `7091b4b`.

### One-time UF events import — October 18

Published two verified THE RESET sessions at Phillips Center to live GlobalQuests,
11:00–12:30 and 15:00–16:30 Eastern Oct 18, 2026. Official UF feed supplies source
IDs/time; UFPA event page supplies venue and ticketed facts; exact Google Places
venue resolution plus existing Gainesville polygon verify coordinates. Each has
cached Gemini JSON tasks and 25 XP GPS/time policy. Existing global map shows both
pins (same-location offsets), existing three-slot acceptance flow is unchanged.
Receipt: docs/uf-oct18-2026-import.json. Operator script:
backend/scripts/import_reviewed_uf_oct18.py (dry-run default, --apply writes).
No scheduler activated; strict generic importer unchanged. See caveat in
backend/UF_CALENDAR_IMPORT.md before activating generic sync on curated records.
Validation: reviewed import/calendar/event tests: 10 passed, 9 emulator-only skipped;
live import repeated safely: 2 updated, no duplicate records.

### Exhibit replacement (latest)

User explicitly chose ONE completion for the entire exhibit, not 25 XP/day.
Later THE RESET session 55853 soft-cancelled; 11 AM remains. Reviewed October 18
importer now excludes 55853 to prevent reappearance. Added Marston's Excavating a
Legacy exhibit through backend/scripts/import_reviewed_uf_exhibit.py; stable ID
uf-calendar-f0eaa24d35d101e60cabfcc0add0a15316cf1d13, no date suffix, retained claims.
Today's reviewed public hours 10 AM–6 PM Eastern; exhibit runs Aug20–Dec18. Future
refreshes must update this SAME event ID, verify that day's hours, and preserve
claims. No scheduler activated. Latest receipt docs/uf-exhibit-2026-import.json.

Added the second requested exhibit: An Unreasonable Commitment to the Square at
4Most Gallery. Script backend/scripts/import_reviewed_uf_square.py; receipt
 docs/uf-square-exhibit-2026-import.json. Stable event ID
uf-calendar-94c28d8137d96320e678716eab9c41a6d1896cc6, one completion across whole
exhibit. Sunday closed per Google Places; published upcoming Monday Oct19 noon–5PM
Eastern window. Source exhibit runs Oct12–23. Existing Marston and 11AM RESET retained.

### Main integration — 2026-10-18

Saved all pending scenery/UI/event work in checkpoint 52e1d29, then merged
origin/main at 861a643 into leaderboard-defaults. Main's CinematicHero, welcome
transition, /home board route, pixel navigation arrows, sidebar refinements,
saved-vibe coordinates, detail-page settings and compatible Gemini/security fixes
are integrated. / and /welcome show the new hero; CTA and internal return links
reach /home. Brand still opens /welcome.

Explicit user requirement was to KEEP existing functionality. Main had changed
GPS and global events to no-XP; this merge intentionally retains this branch's
location/photo XP and 25-default global-event rewards, including user/dorm atomic
awards and once-per-event claims. Main's public-feed creator metadata redaction is
retained. Tests/documentation were reconciled to the preserved reward policy.

Kept: seamless AmbientScene, grounded dragon, no ladder/right fire, softened
reactive foliage and rare leaf shedding, no header signpost, horizontal shuffled
event row with bottom-aligned actions, consistent parchment action buttons,
themed Google popup content, existing reviewed UF exhibit imports and stable IDs.
No live credentials, Firestore rules, scheduler, XP balances or events modified
by this merge. Unrelated root package-lock.json remains untracked.

Integration validation: production build and lint pass; 186 frontend tests pass;
370 backend tests pass with isolated Firestore emulator at 127.0.0.1:8789 (all
emulator cases enabled). Backend tests use explicit local CORS origins to avoid
root .env deployment-origin overrides. Browser verified new welcome hero, animated
CTA navigation to /home, preserved ambient board and live event pins. No live
account was used for acceptance/completion tests.
