# Waymark Gear

Plan, weigh and share the gear you take on adventures — **waymarkgear.com**.

- Build gear lists by picking from the site's **gear catalog** (weights,
  prices, links filled in), or add custom items.
- See base, worn and consumable weight at a glance, per item in any unit.
- Collapse categories into drawers; find lists fast with search and pins.
- Share a read-only link, embed a list, export CSV, or **publish to Explore**
  so it can appear on the homepage. Anyone can **copy** a shared list.
- Keep a **gear closet** of everything you own and build trip lists from it;
  retire old gear without losing trip history.
- **Pack mode**: a phone checklist with big tap targets and swipe to check.
  Installable, and it works offline.
- **Trip planner**: food and water by day, Day 1 vs. last-day pack weight.
- **Import from LighterPack** by link or CSV.
- Public **@profiles** with flagship lists and a gear grid; **comments**,
  **shakedown requests** and notifications on published lists.
- Link previews drawn on the server, and public pages cached for traffic
  spikes.
- Sign in with **Google** or email.
- Site owners manage the catalog (with **CSV import/export**), choose
  featured kits, and moderate reported comments.

Waymark Gear began as a fork of [LighterPack](https://github.com/galenmaly/lighterpack)
by Galen Maly and is licensed under the GPL-2.0 (see [LICENSE](LICENSE)).

**Stack:** Node.js 24 · Express 5 · Vue 3 · Vite · PostgreSQL · Playwright

**Run your own:** [INSTALL.md](INSTALL.md) takes you from nothing to a live
site on DigitalOcean in about 30 minutes, with no server experience needed.

---

## Quick start with Docker

```sh
docker compose up --build
```

Then open http://localhost:3000. To try the catalog with sample gear:
`docker compose exec app node scripts/seed-sample-catalog.js`. This starts the app and Postgres 17;
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

`npm run db:seed-sample` loads a sample gear catalog (generic items, brand
"Sample", no prices) so the picker has something in it. Add your username to
`ADMINS` in `.env` to see the Owner screens.

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
| `MAILGUN_DOMAIN`, `MAILGUN_API_KEY` | — | Password-reset, forgot-username and comment-notification email |
| `MAIL_FROM`, `MAIL_REPLY_TO` | `noreply@<mailgun domain>` | Sender for those emails |
| `ADMINS` | `[]` | JSON array of site-owner usernames: gear catalog and featured kits |
| `MODERATORS` | `[]` | JSON array of usernames allowed into `/moderation` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | Sign in with Google; the button appears when both are set |
| `LIGHTERPACK_URL` | `https://lighterpack.com` | Where "Import from LighterPack" links are read from |
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

The end-to-end suite builds the app, starts its own server, and starts a
stand-in for Google's sign-in (`test/support/fake-oidc.mjs`). CI
(`.github/workflows/ci.yml`) runs all of the above on every push and pull
request, end-to-end on Chromium and Firefox, and checks the Docker image builds.

## Deploying

- **[INSTALL.md](INSTALL.md)**: step-by-step install on DigitalOcean for
  anyone, no server experience assumed. One script sets up the server, and the
  `waymark` command looks after it (status, update, backup, restore). CI runs
  the guide's commands on every pull request.
- **[DEPLOY.md](DEPLOY.md)**: the reference for everything else: publishing
  your own image, Google sign-in, Stripe, Cloudflare, other hosts, scaling.

The production stack is in [`deploy/`](deploy/).

Before launch: finish `PRIVACY.md` and `TERMS.md` (drafts with `[bracketed]`
placeholders), set `VITE_CONTACT_EMAIL` and `VITE_SOURCE_URL`, and replace the
remaining LighterPack artwork in `public/images/` (background images, welcome
screenshot).

## Project layout

```
app.js            Express entry point
server/           API endpoints, auth, security middleware, server-rendered share pages
client/           Vue 3 app (components, views, store) and shared weight/data logic
templates/        Mustache templates for share, embed and policy pages
db/migrations/    Knex migrations
db/seed/          Sample gear catalog CSV
deploy/           Production compose file, Caddyfile, env template, backup script
scripts/          Operator scripts (migrate, seed, delete-account, log tools)
test/             Unit tests (node:test) and end-to-end tests (Playwright)
```
