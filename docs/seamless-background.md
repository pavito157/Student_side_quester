# Seamless ambient background

The ten-second background video is replaced by a static pixel-art plate and independent decorative sprites. There is no shared scene timeline to rewind. The original MP4 remains in the repository for reference/rollback but is not mounted by the application.

## Implementation

- `Sidequester_Frontend/src/components/decor/AmbientScene.tsx` replaces `QuestVideoBackground` at the application root in `src/main.tsx`.
- Styles are at the end of `src/index.css`, prefixed `ambient-`.
- The stage uses the original 16:9 cover behavior, preserving normalized terrain/sprite placement across viewport sizes. It cannot intercept clicks or receive focus.
- Clouds move at different speeds across tracks wider than the stage. Both reset positions are fully off-screen, so the wrap is invisible.
- Dragon breathing, flames, firelight, and fireflies share their 0%/100% state. Smoke and embers have zero opacity at both reset endpoints.
- Animation uses CSS transforms/opacity; there are no JS animation timers, frame loops, media downloads, or video decoders.
- Reduced motion disables animation while leaving the full static scene visible. Existing header foliage and falling leaves retain their own reduced-motion handling.
- The same soft overlay keeps the UI readable. Quest/authentication/ranking behavior and UI controls are unchanged.

## Assets

All project-bound images are in `Sidequester_Frontend/public/art/ambient/`:

| File | Purpose |
| --- | --- |
| `scene-plate.webp` | Pale sage map/grid, terrain, tent, tree platforms and castles; no baked moving elements. |
| `dragon.webp` | Transparent green resting dragon sprite. |
| `cloud.webp` | Transparent cream/ice-blue pixel cloud, reused at multiple scales/phases. |
| `flame.webp` | Transparent flame placed over the left static fire pit. |

The built-in image-generation tool was used, with a frame from Luis's existing MP4 as the style/composition reference. Generated originals remain in Codex's generated-images directory; final WebP assets are copied into this repository. Alpha-bound cropping and lossless WebP conversion prepare the sprites for the app; originals are preserved. Total production image payload is approximately 1.9 MB.

### Final prompt set

1. **Static plate — precise-object-edit:** Reconstruct the reference as a 16:9 pixel-art background. Preserve the pale sage graph-paper map, faint dotted routes and landmarks, tiny floating tree platforms, bottom-left grassy/dirt platform with tent, ladder, mountains and blue castle silhouettes, bottom-right terrain and upper-right gray castle. Remove the dragon, clouds, loose flying leaves, sparks/smoke, fire flames, leafy corner branches, player controls, timeline, and dark player gradient; keep stone/log fire pits and reconstruct terrain naturally to the bottom edge. Keep the central 70% calm. Same muted green/blue/brown palette and pixel shading; no text, UI, watermark, forest clutter, or new objects.
2. **Dragon — background-extraction/identity-preserve:** Isolate/recreate the reference's friendly forest-green dragon, facing left, with cream segmented belly, swept-back pale horns, folded olive-membrane wings, small clawed feet and curled tail. Entire sprite, transparent background, no platform, rocks, plants, smoke, fire, text or shadow. Match the resting pose, proportions, restrained teal/sage palette and crisp 16-bit shading. A cleanup edit preserves identity/pose/details while removing surrounding halo/shadow and requiring clear alpha outside the silhouette.
3. **Cloud — background-extraction:** One wide, low fluffy pixel cloud, cream/white upper pixels, pale ice-blue underside, thin muted blue pixel outline, matching reference shading. Center tightly on actual alpha; no sky, glow, other objects or text. Approximately 3:1 silhouette, readable around 90px wide.
4. **Flame — background-extraction:** One compact upward pixel flame matching the reference campfires: golden center, orange middle, muted red edge pixels, actual transparent background. Flame only, no logs, stone ring, ground, particles, smoke, text or glow. Approximately 3:4 silhouette, suitable for subtle CSS flicker at 35–50px tall.

## Verification

From `Sidequester_Frontend`:

```sh
node --experimental-vm-modules --test tests/*.test.mjs
npm run build
npm run lint
```

162 tests pass after this change; build succeeds and lint has no errors (existing test escape warnings remain). `tests/ambientScene.test.mjs` replaces obsolete video tests and checks decorative isolation, bundled sprites and reduced-motion coverage. Browser checks confirmed one scene, zero video elements, all seven image instances loaded, off-screen cloud reset bounds, periodic endpoint declarations, and no horizontal overflow. A temporary scenery-only preview is used to inspect the dragon, fire placement and overall composition without covering the art with panels. No production quests or accounts are modified during visual checks.

### Scenery cleanup

Lowered the dragon to `bottom:6.6%` with bottom-anchored breathing. Removed the right flame/embers and its baked stone/log pit, and removed the static ladder. Built-in imagegen precise-object-edit prompt: "Remove only the lower-left wooden ladder and bottom-right stone campfire ring/logs; reconstruct matching castle silhouette, grid, and grass. Keep the left campfire and all other composition, colors, and pixel style unchanged." Edited plate saved to `Sidequester_Frontend/public/art/ambient/scene-plate.webp`. Build and all three ambient-scene tests pass.
