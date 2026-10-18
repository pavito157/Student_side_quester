# Leaderboard rank integration

Integrated display logic from `origin/Aarav-leaderboard` commit `1fcbfcf` into the current feature structure. The cozy theme, navigation, dynamic background, and asset system remain. Aarav's top-three podium and remaining-roster structure are integrated using the shared cream frames, crown/trophy sprites, pixel headings, and sage highlights. His separate CSS palette, forest, and emblem artwork are not imported.

Both Students and UF Dorms use total backend XP to derive a tier:

| Minimum XP | Tier |
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

Bars show progress within the current 50-XP tier; Radiant stays full. The first three leaderboard positions have Gold/Silver/Bronze placement labels, independently of XP tier. The signed-in student is highlighted and sees the XP needed to strictly exceed the row above, including ties. A first-place student sees the leading-player message. No current-player message is invented if the user is absent from the returned results.

Rank helpers never write XP or reorder API rows. Firebase token exchange, validation, endpoints, member counts, account guards, and stale-request cancellation remain unchanged. Older optional response diagnostics used by Aarav's page were not made dependencies of the current API response.

## Validation

Run from `Sidequester_Frontend`:

```sh
node --experimental-vm-modules --test tests/*.test.mjs
npm run build
npm run lint
```

Tests cover every tier threshold and adjacent values, capped tiers, invalid XP, ties, unsafe comparisons, student highlighting, zero-XP dorms, category switching, empty/error/signed-out states, missing current users, and late responses after a category switch. Populated desktop and narrow layouts are checked using a temporary read-only renderer of the real component with labeled sample data; no production account or XP mutations are needed.

The top-achievers podium shows only actual returned competitors; the roster starts at fourth place and is omitted when no remaining competitors exist. Cards stack on narrow screens. Regression tests cover partial podiums and prevent duplicated or renumbered rankings.
