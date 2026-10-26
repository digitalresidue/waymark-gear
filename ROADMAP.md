# Waymark Gear roadmap

Living document. Each phase gets a dated entry in the changelog when it ships;
the plan below it is what comes next. Last updated **2026-10-26** (Phase 4 built).

---

## Changelog

### Phase 4 — Community & everyday polish · 2026-10-26 · branch `phase4`
- **Shakedown board** on the homepage: lists asking for a shakedown, fewest suggestions first.
- **Follow hikers** from profiles and shared lists; **Following** filter on Explore; followers are notified when you publish a new list.
- **Trip type** per list (day hike, backpacking, section hike, thru-hike); Explore filters and a sort menu (featured, newest, top this month, lightest).
- **Votes and leaderboards**: up/down votes on published lists, counted for 30 days; `/leaderboard` by trip type (top this month, lightest).
- **Notifications page** (`/notifications`) with per-type in-app/email settings (comments, suggestions, replies, new followers, followed hikers publishing), and the list of hikers you follow.
- **Closet categories** you define, as filters in the closet (desktop and phone).
- **Gear details**: up to 6 photos per item (fit within 512×512), buy link, YouTube review link; shown in lists as "Photos" / "▶ Review" links that open a **lightbox**, with an in-site video view counter.
- **Print view** (`/print`): compact paper checklist, 1–3 columns, text size, optional descriptions/quantities/worn marks; no weights or stats.
- **Report a problem → tickets**: `/report` from the footer, shared lists and gear details; staff queue at `/staff/tickets` with status, priority, assignee and notes.
- **Theme per account**: follows the device by default; a light/dark choice is saved to the account and applied on every device ("Match my device" to reset).
- **Profile tags**: activities, seasons and up to five of your own.
- **Share images** now include the list description and the author's avatar. Still drawn on request into a bounded memory cache: nothing accumulates on disk.

### Phase 3 — Closet, packing, community · 2026-10-26 · PR #12
- Gear Closet on relational storage (users → lists → categories → items, user_id in every key); edits sync per item, so tabs/devices don't overwrite each other; retire instead of delete.
- Pack mode (`/pack`): phone checklist, tap or swipe, progress, start over.
- Installable PWA; works offline and syncs on reconnect.
- Trip planner: food and water by day, Day 1 vs last-day pack weight.
- Import from LighterPack by link or CSV, reusing closet gear.
- Public `@profiles`: banner, avatar, trail name, markdown bio, social links, 3 flagship lists, gear grid.
- Comments on published lists, "Request a shakedown", bell notifications, optional email, reports + moderation queue.
- Link-preview images (list and profile) drawn on our own server.
- Public pages cached for traffic spikes; Cloudflare rule; robots.txt + sitemap.
- Fixes: web fonts never loaded in production; expired session on save; phone totals invisible in light mode; deleting an account no longer deletes others' replies.

### Phase 2 — Redesign as Waymark Gear · 2026-10-25
- New brand, homepage, Explore, list switcher with search and pins, collapsible categories.
- Owner gear catalog with CSV import/export; catalog picker.
- Google sign-in + email; publish to Explore; featured kits; "Copy to my lists".
- DEPLOY.md, Docker production stack, CI (Chromium + Firefox), release images, Dependabot.

### Phase 1 — Hardening the LighterPack fork · 2026-10-25
- Node 24, Express 5, Vue 3, Vite, PostgreSQL; security headers, CSP, rate limits, hashed sessions; test suite.

---

## Phase 4 — Community & everyday polish (built 2026-10-26, see changelog)

**Discover and follow**
1. **Shakedown board on the homepage**: crowdsourced cards of lists asking for a shakedown (newest and "needs help" = fewest suggestions), each opening the list's suggestion thread.
2. **Follow hikers** and see a **Following** feed of their newly published lists; a "Following" selector on profiles and Explore.
3. **Trip type** on each list (day hike, backpacking, section hike, thru-hike) plus **profile tags** (season, activity, trail name). Explore filters and sorting by these, not only by weight.
4. **Votes and leaderboards**: up/down votes on published lists; votes count for 30 days so rankings stay fresh; leaderboards by trip type and weight class.

**Notifications**
5. **Notifications page** (`/notifications`) like other social apps, with per-type settings (in app / email / off): comments, replies, shakedown suggestions, new followers, a followed hiker publishes. Built so new kinds slot in later.

**Your gear**
6. **Closet categories** you define (e.g. Insulation, Shelter), separate from list categories.
7. **Gear photos**: upload per closet item, compressed to at most 512×512, shown as a small "Photos" link that opens a **lightbox**, never inline at random sizes.
8. **Buy and review links per item**: buy link defaults from the catalog (bulk via CSV); users can add a YouTube review link that plays in an in-site lightbox, with our own view counter.
9. **Print view**: compact, checkbox-style paper list of what's in the pack (no stats or weights), with a few layout options (columns, font size, include descriptions).

**Running the site**
10. **Report a problem → tickets**: a "Report" button on catalog items, lists and pages files a ticket (not an email) into an owner/staff **Tickets** page with status, priority and assignee.
11. **Theme per account**: follow the device setting by default; light/dark override saved to the account and applied on every device.
12. **Share-image upgrade**: add the list description and `@user` avatar to the card. *Disk note:* images are drawn on request and kept only in a bounded memory cache (300 images), so nothing accumulates on disk; the URL version changes on every edit, so link previews refresh. If we later store them, it'll be one file per list, overwritten on save.

## Phase 5 — Plan together (proposed next run)
- **Real-time collaboration**: invite partners or a group leader to one list (owner / editor / viewer); live edits and presence via WebSockets, building on the per-item sync from Phase 3.
- **Group gear**: who owns and carries what, so a group doesn't double-pack (seen on Packry).
- **Gear kits**: bundles you always carry together, added to any list in one click (Packstack).
- **Packed vs used**: after a trip, mark what you didn't use, to trim the next pack (Packry).
- **Quantity owned** warnings when a list uses more than you own (Packstack).

## Phase 6 — The trip hub
- **Trip journal**: trip "folders" with day-by-day entries (dated automatically or set by hand), photos, linked pack list; public, followers-only or private.
- **Gear reviews**: staff reviews first, then users; star rating, pros/cons, linked to catalog items and closet gear.
- **Trip details**: distance, elevation gain, terrain, expected temperatures (Packstack), feeding the trip planner.
- **Calorie and water estimates** with a safety margin, on top of today's trip planner.
- **Gear lifecycle**: condition, age and a replace-soon hint.

## Phase 7 — Smarter gear
- **Comparisons**: side-by-side catalog items (weight, price, specs).
- **Gear analysis**: missing-essentials check, lighter-alternative suggestions, trip-readiness score (Hikt).
- **Retail and affiliate links**, price tracking and alerts (PackWizard).
- **Public API + an MCP server**, so people's AI assistants can read (and with permission edit) their gear (Packstack offers this).
- Native mobile apps if the PWA isn't enough; more languages (Hikt has 9).

---

## Competitors we watch
| Site | What stands out |
| --- | --- |
| hikt.app | Smart insights (missing safety gear, lighter alternatives, readiness score), collaboration, 9 languages |
| packry.app | Group inventory (who owns what), packed-vs-used tracking, self-hostable |
| packstack.io | Gear kits, quantity-owned warnings, lifecycle/replacement score, calorie estimates, MCP server for AI assistants |
| packwizard.com | Lightweight gear research, suggestions and price tracking |

## Before launch (owner to-do)
- Merge PR #12 and deploy (migrations run automatically).
- Set VITE_CONTACT_EMAIL / VITE_SOURCE_URL; make the repo public or point the source link at a public mirror (GPL).
- Real Google OAuth client; Mailgun keys (resets and notification email).
- Fill in PRIVACY.md / TERMS.md placeholders; optional Cloudflare cache rule (DEPLOY.md).
- Review Dependabot majors one at a time (Node 26, config 5, nanoid 6, ESLint 10).
