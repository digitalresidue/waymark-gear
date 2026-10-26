# Contributing to Waymark Gear

1. Use Node.js 24 (`nvm use`) and follow the local development steps in the
   [README](README.md).
2. Keep `npm run lint`, `npm run test:unit` and the Playwright suite passing;
   CI runs all three on every pull request.
3. Schema changes go in a new file under `db/migrations/`
   (`YYYYMMDDHHMMSS_description.js` exporting `up` and `down`). Never edit a
   migration that has already shipped.
4. By contributing you agree your changes are licensed under the GPL-2.0, like
   the rest of the project.
