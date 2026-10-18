# Quest personalization

The current form sends `activeVibe: {name, preferences}` only for the selected
saved vibe, and `activeVibe: null` when none is selected. Vibe filters populate
the existing form; the submitted form values (including subsequent edits) are
the constraints used by the backend. Stored vibe documents are unchanged.

For older clients, an omitted `activeVibe` retains the existing
`vibePreferences` behavior. Explicit `activeVibe: null` overrides stale legacy
text. Saved request serialization preserves that distinction for regeneration.

`backend/personalization.py` selects the creative source for both Places
discovery and Gemini:

1. Selected vibe name and description.
2. General preferences when no vibe is selected.
3. Relevant goals when neither is present.
4. A cohesive playful local recreation theme when all are absent.

Supporting interests may enrich the primary experience, never replace it.
Safety, verified destinations, submitted constraints and explicit exclusions
take precedence. Guest free text already supports current-request preferences;
signed-in users currently have constraint controls but no separate one-off
instruction field. This change adds no UI field or inferred instruction source.

Discovery sends the full primary text independently of supporting profile text,
without the old 180-character combined truncation. All four search profiles are
scoped to that experience. Candidate pooling favors the primary search while
retaining popular, niche and exploratory candidates. Single-place selection uses
a varied shortlist of primary-search matches when available. Provider matches
are relevance signals, not verified facilities, activities, prices or availability.

The existing number of provider queries, photo review, XP accounting, route
mapping, ten-step limit and budget validation remain unchanged. Offline tests
verify routing and contracts; they cannot establish live search or model quality.

For live quality review, compare Study Break (affordable, energizing recreation)
against a quiet art-focused vibe with the same general preferences and limits.
Check actual activities and destination fit, not just titles. Clear the vibe and
verify general preferences lead. Clear those too and verify one coherent mission
theme. Retain the same hard limits throughout. Do not treat a park walk, arbitrary
count or feature list as a successful Study Break interpretation unless requested.
