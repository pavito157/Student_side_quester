# Selective quest generation rollback

The restored flow verifies destinations using the conditional personalization
context, makes one Gemini generation request, validates content/proof methods and
hard bounds, and geographically orders new multi-stop quests before persistence.
It does not make experience-planning or semantic-review requests. Existing saved
quests, photo verification and completion/XP accounting are unchanged.

Active vibe name/description, no-vibe preference/goal/Surprise Me fallback,
relevance-weighted destination selection, adaptive 1–10 steps, conservative route
dependencies, map previews and directions remain. This is a selective restoration,
not a checkout of HEAD: those improvements included uncommitted work.

Proof compatibility remains deterministic. The single generation response supplies
one private `stepEvidence` object per step, with proof obligations and an explicit
photo-result description where applicable. Presence-only location proof cannot
satisfy action completion; photo proof requires visible-result obligations and
nonempty expected evidence. Enabled recreation remains unverified and zero XP.
Evidence objects are reordered with their actions and excluded from public/saved
quest contracts. These annotations are model-authored; there is no longer a
separate semantic evaluator of their accuracy or of activity feasibility. Prompts
continue to forbid unsupported venue access, facilities, prices and events.

## Recovering the pre-rollback implementation

A pre-edit source snapshot is outside the repository at:

`C:\Users\aarav\AppData\Local\Temp\Sidequester-backup-20261018-002520`

It contains `files/` (176 tracked/nonignored untracked project files),
`git-status.txt`, `HEAD.txt`, and `excluded-paths.txt`. Git metadata, dependencies,
build outputs and ignored files were not copied. All `.env` files, the two
`.env.example` files and the Firebase configuration containing an API-key-shaped
value were excluded. Credentials/configuration stay in the original repository.
No raw diff was saved, to avoid copying secrets embedded in removed lines.
The snapshot is in Temp; move it to durable private storage if retaining it long term.

To restore, stop FastAPI first and preserve any work done after this rollback.
From PowerShell:

```powershell
$backup = 'C:\Users\aarav\AppData\Local\Temp\Sidequester-backup-20261018-002520'
$repo = 'C:\Users\aarav\sidequester-backend'
Copy-Item -Path "$backup\files\*" -Destination $repo -Recurse -Force
```

This overlays the saved project files, including the removed planner, reviewer,
diagnostics and tests. It does not restore or overwrite excluded secrets and does
not change Git history/index. The two files added during rollback,
`backend/tests/test_generation_rollback.py` and this document, can be removed
individually after inspecting them if an exact source snapshot is desired.
Do not use `git reset --hard`, `git clean`, or recursive repository deletion.

## Validation

Run backend tests with the project virtual environment:

```powershell
./.venv/Scripts/python.exe -m unittest discover -s backend/tests
```

From `Sidequester_Frontend`:

```powershell
node --experimental-vm-modules --test tests/*.test.mjs
npm.cmd run build
```

The frontend requires the VM-modules flag. Existing full-suite failures concern a
missing `src/services/sidequest.ts`, stale VM mocks missing `MAX_QUEST_STEPS`, and
navigation fixtures without destination mappings. No frontend source or tests
were changed during rollback. Focused personalization, map, directions, generation
button and API-error tests pass. Production build passes with a bundle-size warning.
No live Gemini success has been established by offline tests.

Final backend result: 268 tests run, 55 skipped, no failures (213 executed and
passed). The removed pipeline had 37 tests exclusive to its planner/reviewer;
five rollback regressions replace that coverage for the restored architecture.
Frontend: 26 focused tests pass; full suite 52 pass and 46 pre-existing failures.

## Exact source changes relative to the pre-edit snapshot

Modified:

- `backend/destination_resolver.py`
- `backend/quest_contracts.py`
- `backend/quest_generation.py`
- `backend/quest_route_ordering.py`
- `backend/tests/test_destination_selection.py`
- `backend/tests/test_quest_contracts.py`
- `backend/tests/test_quest_generation.py`
- `backend/tests/test_quest_route_ordering.py`

Added:

- `backend/tests/test_generation_rollback.py`
- `docs/quest_generation_rollback.md`

Removed (all recoverable from the backup):

- `backend/experience_planning.py`
- `backend/experience_diagnostics.py`
- `backend/tests/experience_fixtures.py`
- `backend/tests/test_experience_planning.py`
- `backend/tests/test_experience_provider_diagnostics.py`
- `backend/tests/test_gym_experience_contract.py`
- `docs/experience_fulfillment.md`
