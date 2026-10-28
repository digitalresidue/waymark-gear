# Contributing to Waymark Gear

1. Use Node.js 26 (`nvm use`) and follow the local development steps in the
   [README](README.md).
2. Keep `npm run lint`, `npm run test:unit` and the Playwright suite passing;
   CI runs all three on every pull request.
3. Schema changes go in a new file under `db/migrations/`
   (`YYYYMMDDHHMMSS_description.js` exporting `up` and `down`). Never edit a
   migration that has already shipped.
4. If you change anything a site owner sees while installing or running a
   server (`deploy/`, settings, the Dockerfile, ports, migrations that need a
   step), update [INSTALL.md](INSTALL.md) in the same pull request.
   `test/unit/install-guide.test.js` and the "Docker image builds" CI job
   catch most drift, but not wording.
5. By contributing you agree your changes are licensed under the GPL-2.0, like
   the rest of the project.

## Releasing

INSTALL.md is written for people who have never run a server, so every
release re-checks it:

1. Bump `version` in `package.json`.
2. Walk through [INSTALL.md](INSTALL.md) as a newcomer would. Read every step
   against what the scripts now do and print; the CI job proves the commands
   work, not that the words still match.
3. Update its **"Checked with Waymark Gear x.y.z"** line to the new version.
   The unit tests fail until you do, which is the point. If you also walked
   through DigitalOcean's screens, update **"screens last checked"**.
4. Note anything an existing site owner has to do in the release notes, and
   prefer making `waymark update` do it for them (it already adds new
   settings to `.env` as comments, and refreshes `deploy/` files from the
   image).
5. Merge to `main`; the Release image workflow publishes `:latest`, which is
   what `waymark update` fetches.
