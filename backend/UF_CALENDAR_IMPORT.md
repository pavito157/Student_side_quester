# Daily UF calendar quests

The importer reads https://calendar.ufl.edu/live/ical/events and publishes the next
14 days of eligible event occurrences to the existing Campus quest board. It does
not call Gemini or use personal quest slots. Imported cards link to the original
UF Calendar listing; this is source attribution, not an organization endorsement.

## Eligibility

- A physical venue with feed-provided GEO coordinates strictly inside the reviewed
  Gainesville city GeoJSON configured by `GAINESVILLE_BOUNDARY_PATH`.
- Explicit start **and end** timestamps with a timezone. All-day entries are skipped.
- No online/hybrid metadata, online meeting URL, or online/virtual venue label.
- A valid official UF Calendar event link and valid existing event schema.
- Cancelled events are rejected. Feed entries without coordinates are skipped,
  rather than guessed/geocoded. This deliberately imports a subset of UF events.

Published quests retain their GPS radius, accuracy, grace and verification policy
for attendance check-in. Browser-reported GPS is spoofable, so check-ins currently
award no XP. No browser can set import provenance or reward values.

UF LiveWhale event IDs identify ordinary events even if rescheduled. Recurring
instances use the original recurrence timestamp as well, so each occurrence has
its own once-per-user reward. Repeating an import updates those same document IDs;
it never clears attendance claims or rewrites balances.

If an already imported occurrence becomes explicitly cancelled, virtual, outside
Gainesville, or otherwise ineligible, it is marked cancelled and cannot be checked
in. If an entry simply disappears from the feed, it is left until its original end
time; absence alone is not reliable proof of cancellation. Fetch/parse failures
perform no writes. An interrupted write pass can be safely rerun. Manual events
are never modified. Existing events remain visible if a daily sync fails.

## Preview and run

From the repository root, with backend dependencies installed:

```sh
python -m backend.scripts.import_uf_events
python -m backend.scripts.import_uf_events --apply --days 14
```

The first command is a read-only preview with rejection counts. The second writes
to the Firebase project selected by the server credentials. Do not use production
credentials in automated tests. `--days` supports 1–31 days. The root ignored `.env`
is loaded by the CLI; never commit credentials. A dry run needs the boundary file
but does not initialize Firebase or require a Places key.

## Ubuntu activation (one installation on the backend host)

The supplied units match `docs/DEPLOYMENT.md`: service user `sidequester`, checkout
`/opt/sidequester`, venv `.venv`, and root `.env`. Adjust these paths if the host
layout differs. Ensure `GAINESVILLE_BOUNDARY_PATH` and
`GOOGLE_APPLICATION_CREDENTIALS` refer to files readable by that service account.

After deploying this code to the server:

```sh
cd /opt/sidequester
sudo -u sidequester .venv/bin/pip install -r backend/requirements.txt
sudo -u sidequester .venv/bin/python -m backend.scripts.import_uf_events
sudo cp deploy/systemd/sidequester-uf-events.service /etc/systemd/system/
sudo cp deploy/systemd/sidequester-uf-events.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start sidequester-uf-events.service
sudo systemctl enable --now sidequester-uf-events.timer
sudo systemctl list-timers sidequester-uf-events.timer
sudo journalctl -u sidequester-uf-events.service -n 30 --no-pager
sudo systemctl restart sidequester-api
```

Timer: **00:00 America/New_York**, following Eastern daylight saving time. This is
local midnight year-round, rather than fixed UTC−5 during summer. `Persistent=true`
runs a missed import after the server comes back online. A service run is limited
to five minutes; failures are visible in systemd/journald. No public scheduler
endpoint or extra shared secret is introduced. Starting the timer, not merely
committing these files, activates daily imports.

Last successful sync counts/time are stored server-side at
`Organizations/_uf_calendar_import/sync/latest`, protected by existing rules.
Monitor service failures with the host's existing monitoring. To stop imports:
`sudo systemctl disable --now sidequester-uf-events.timer`.

## Verification

Run `backend.tests.test_uf_calendar` with the local Firestore emulator. Tests cover
physical/online/hybrid/out-of-city filters, missing GPS, all-day and invalid times,
recurrence exclusions, daylight saving, repeat imports, preserved reward policy,
cancellation blocking attendance, and source failures/collision protection.
Existing global quest tests cover GPS/time enforcement, duplicate attendance and
atomic user/residence XP. After activation, confirm imported cards have their UF
source link and match their source's time and venue before checking in on site.
