# Organization quests

Organization quests are public board entries. Browsing does not require a
signed-in user and does not call Gemini. Accepting requires a verified Firebase
account, generates an individualized saved quest through the existing Gemini
and destination-verification flow, and uses one of the user's three active
sidequest slots.

## Firestore documents

Store organization profiles in `Organizations/{organizationId}` with a non-empty
`name` and `isPublic: true`. Store quest entries in
`Organizations/{organizationId}/quests/{questId}` with `title`, `summary`,
`details`, `published: true`, and a `questRequest`.

`questRequest` must satisfy the existing `GenerateQuestRequest` contract. Keep it
concise and focused on the activity; Gemini generates the actual steps and
verifies a suitable destination when a user accepts. Organization records must
be public (`isPublic: true`) and quests must be published (`published: true`)
before they appear on the board. The board response is an explicit public-field
allowlist and does not expose `questRequest` or unrelated Firestore properties.

## API

- `GET /organization-quests` lists published quests under public organizations.
- `POST /organization-quests/{organization_id}/{quest_id}/accept` requires a
  verified Firebase ID token. It returns the newly saved quest, or reports a
  full active-quest limit (`429`) or duplicate active organization quest (`409`).

Only one active copy of an organization quest is allowed per user. The server
checks before generating to avoid unnecessary Gemini calls and rechecks within
the save transaction to cover concurrent accepts. Completing or abandoning the
saved sidequest frees the organization quest to be accepted again.

No sample organization or quest is seeded. The board will remain empty until
real published organization records are added.
