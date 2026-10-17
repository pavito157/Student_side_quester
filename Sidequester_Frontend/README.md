# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Google Places setup

Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_MAPS_API_KEY` to a
Google Maps API key. Enable Maps JavaScript API and Places API (New) for the
key's Google Cloud project. Enable Maps JavaScript API, Places API (New), and
Geocoding API. Restrict the key to this app's HTTP referrers and the APIs the
app uses before deploying. Browser API keys are visible to users in the client
bundle, so do not use an unrestricted key.

The Where field uses Google Places autocomplete and biases suggestions toward
Gainesville, Florida. Its “Use my location” button requires browser location
permission and a secure context (HTTPS or localhost). Sidequest suggestions
are currently available for the campus locations listed in
`src/componenets/Buttons/QuestFilterButtons.tsx`.

## User preferences and goals

For signed-in users, general preferences are stored as plain text in the
`preferences` field of `Users/{Clerk user ID}`. Individual sidequest goals are
stored separately as a string array in that document's `goals` field. Both use
the Firebase client SDK; Firestore security rules are managed separately.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.
You can also try [the experimental native React Compiler support in plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#rust-react-compiler) by using `compiler: true` in the plugin options instead of using the Babel plugin.

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
