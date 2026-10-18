# Cozy RPG interface

The frontend uses cream paper, wooden frames, sage actions, pixel headings, and decorative garden artwork. Shared styles cover the board, journal, quest details and previews, menus, settings, leaderboard, welcome page, and organization forms. Quest cards contain text and small decorative sprites, without quest thumbnail illustrations. Google Maps remains native, with a pixel reward pin and live server-provided XP text.

## Assets and provenance

Production assets live in `Sidequester_Frontend/public/art/cozy/`.

Selected UI frames, symbols, coin, portrait, pointer, and the Sprout pixel font were extracted from the user-supplied **Sprout Lands – UI Pack – Basic pack** by [Cup Nooble](https://cupnooble.itch.io/sprout-lands-ui-pack). The included `CUP-NOOBLE-LICENSE.txt` preserves the supplied license. Only selected application assets are included, not the source pack or full sprite sheets. The board footer credits the artist. The supplied basic pack is licensed for noncommercial projects; check its license before commercial distribution.

Original matching artwork was created with the built-in image generator, using the approved mockup as a visual reference. Transparent icons were cropped to their alpha bounds without resampling; the opaque garden was converted to WebP. Generated source images remain in the local Codex image output folder; the application uses the copies below.

| Output | Generation prompt / mode |
| --- | --- |
| `leaf.png`, `sprout.png`, `rose.png`, `watch.png`, `compass.png`, `map.png`, `satchel.png`, `flag.png`, `search.png`, `gps.png`, `globe.png`, `signpost.png` | Transparent image generation: a production 4-by-3 atlas of cozy 16-bit RPG icons, centered evenly without overlap or text. Warm tan, sage, pistachio, cream, brown outlines, crisp block pixels. Row 1: leaf, sprout, rose, watch; row 2: compass, map, satchel, flag; row 3: search, GPS, globe, signpost. Match the supplied mockup. |
| `garden.webp` | Opaque image generation: portrait cozy pixel garden with a quiet central 75%, trees and flowers along the outer edges, aqua stream at left and bottom, small bench at right, wooden bridge at bottom, sky opening at top. Pastel limited palette, sharp pixels, detail concentrated along outer 12% and bottom 10%. No UI, text, characters, or buildings. |
| `canopy.png` | Transparent image generation: one upper-left branch, warm brown wood, sage and pistachio leaves in four pixel shades with golden highlights. Taper toward the right, crisp 16-bit style, no scenery or text. Designed for small on-screen use and mirroring on the right. |
| `xp-pin.svg` | Editable native SVG, with a stepped orange pixel silhouette. The XP number is rendered separately in the marker button, so it always reflects the actual quest reward. |

## Behavior preserved

The work changes presentation and placement. Existing authentication, filters and advanced settings, API payloads, three-slot limit, quest navigation, event acceptance, GPS verification, completion, abandonment, admin permissions, and XP accounting continue through their existing handlers and services. No backend or database rules changed.

Button feedback, foliage return/bounce, leaf shedding, falling leaves, generation effects, and reduced-motion handling are retained. The main form and goals/preferences share the same outer content width. Journal cards stack on narrow screens.

## Validation

Run from `Sidequester_Frontend`:

```sh
node --experimental-vm-modules --test tests/*.test.mjs
npm run build
npm run lint
```

Visual checks cover the guest board, narrow-screen board, settings, welcome page, event map pin navigation, and event preview. The signed-in journal was additionally rendered with sample display data through a temporary read-only local preview, without writing accounts or quests. Authenticated production completion, GPS check-in, and admin mutations were not performed during this UI pass.

## Main animation integration

Integrated main through `481b48d`: its responsive sidebar shell, scrolling editor and fixed footer, card entrance/hover effects, header sprite motion, settings journal entrance, fireflies, drifting leaves, and button-reactive sprigs. The existing cozy borders, palette, fonts, button frames, pointer/leaf/branch/signpost/compass assets, map pins, and garden remain. New lantern, mushroom, and hanging-vine decorations from main remain as additional animated accents. Motion selectors support image sprites as well as SVGs, including reduced-motion handling.

The sidebar stays fixed to the viewport. Its close delay now matches the 420ms exit animation, and reopening during that delay cancels the close and removes the stale closing class. Regression tests cover interrupted close/reopen, reduced-motion close, and the existing Escape callback. Quest and account handlers were retained.

## Luis background integration

Imported `gemini_generated_video_342ca554.mp4` from `luis_ui` (`73b4d51`) and restored that branch's `/art/leafy-corner.png` header foliage. Per the requested scope, the video mounts once at the application root and appears across all routes; Luis's unrelated quest-page layouts and scrolling changes were not imported. It loops muted behind every interactive layer, with his light overlay. Foliage bounce, shedding, and the existing UI remain intact.

Reduced-motion preferences prevent video rendering, including live preference changes. Video/source failures remove the video while retaining the static garden fallback. The regression suite now has 138 passing tests, including preference changes and failed-media fallback. A browser check confirmed one playing, muted video layer on the board and after navigation to welcome. No production quest or account mutations were performed.
