# Waymark Gear

Plan, weigh and share the gear you take on adventures: build gear lists by
category, see base, worn and consumable weight at a glance, and share a list
with a link or embed it on your own site.

Waymark Gear began as a fork of [LighterPack](https://github.com/galenmaly/lighterpack)
by Galen Maly and is licensed under the GPL-2.0 (see [LICENSE](LICENSE)).

**Stack:** Node.js 24 · Express 5 · Vue 3 · Vite · PostgreSQL · Playwright

---

## Quick start with Docker

```sh
docker compose up --build
```

Then open http://localhost:3000. This starts the app and Postgres 17;
database migrations run automatically on startup and uploaded photos are kept
in a Docker volume.

## Local development

You need Node.js 24 (`nvm use` reads `.nvmrc`), PostgreSQL 13 or newer, and
`cwebp` for photo uploads (`brew install webp` / `apt install webp`).

```sh
# 1. Create a database and user
createuser waymark --pwprompt
createdb waymark --owner waymark

# 2. Configure
cp .env.example .env        # set DATABASE_URL

# 3. Install and run
npm install
npm run dev                 # http://localhost:3000, with hot reload
```

Dev mode serves source through Vite with hot reload. If a `public/dist`
folder exists from an earlier `npm run build`, it serves that build instead;
delete the folder to get hot reload back.

Migrations apply when the server starts. To run them yourself:
`npm run db:migrate` (or `-- status`, `-- down`).

## Configuration

Settings come from environment variables (or a `.env` file in development),
falling back to `config/default.json`. The ones you're most likely to set:

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string |
| `DEPLOY_URL` | `http://localhost:3000` | Public URL, used in emailed links and embeds |
| `PORT` | `3000` | Port to listen on |
| `NODE_ENV` | `development` | `production` enables secure cookies, HSTS, HTTPS upgrades |
| `TRUST_PROXY` | `1` | Reverse proxies in front of the app. **Set `0` if none**, or clients can spoof their IP past the rate limiter |
| `SESSION_DAYS` | `90` | How long a sign-in lasts |
| `MAILGUN_DOMAIN`, `MAILGUN_API_KEY` | — | Password-reset and forgot-username email |
| `MAIL_FROM`, `MAIL_REPLY_TO` | `noreply@<mailgun domain>` | Sender for those emails |
| `MODERATORS` | `[]` | JSON array of usernames allowed into `/moderation` |
| `VITE_CONTACT_EMAIL` | — | *Build time.* Contact address in the footer and help; hidden if unset |
| `VITE_SOURCE_URL` | upstream LighterPack | *Build time.* Source link in the footer (the GPL requires offering source) |

The full list, including rate-limit and pool settings, is in
[`.env.example`](.env.example) and
[`config/custom-environment-variables.json`](config/custom-environment-variables.json).

## Tests

```sh
npm run lint
npm run test:unit
npx playwright install chromium   # once
npm test                          # end-to-end; needs DATABASE_URL and cwebp
```

The end-to-end suite builds the app and starts its own server. CI
(`.github/workflows/ci.yml`) runs all of the above on every push and pull
request, end-to-end on Chromium and Firefox, and checks the Docker image builds.

## Deploying

- Run the Docker image (or `npm ci && npm run build && npm start`) behind a
  TLS-terminating proxy, with `NODE_ENV=production` and `DEPLOY_URL` set to
  your public `https://` URL.
- Keep `public/userimages` (the `/app/public/userimages` volume in Docker) on
  persistent storage and back it up along with the database.
- `/healthz` returns 200 when the app can reach the database.
- The rate limiter is in-memory, so it counts per process. Running several
  instances needs a shared store; see `server/security.js`.

## Before you launch

- [ ] Fill in and review `PRIVACY.md` and `TERMS.md` (served at `/privacy` and
      `/terms`). They're drafts with `[bracketed]` placeholders.
- [ ] Set `VITE_SOURCE_URL` to your repository and `VITE_CONTACT_EMAIL`.
- [ ] Replace inherited LighterPack artwork in `public/` (favicon, welcome
      screenshot, background images) with your own.
- [ ] Configure Mailgun so password resets work.

## Project layout

```
app.js            Express entry point
server/           API endpoints, auth, security middleware, server-rendered share pages
client/           Vue 3 app (components, views, store) and shared weight/data logic
templates/        Mustache templates for share, embed and policy pages
db/migrations/    Knex migrations
scripts/          Operator scripts (migrate, delete-account, log tools)
test/             Unit tests (node:test) and end-to-end tests (Playwright)
```
