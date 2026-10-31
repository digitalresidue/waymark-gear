# Waymark Gear roadmap

What comes next, and what's been decided. **What's been built** is recorded in
each merged pull request
([merged pull requests](https://github.com/digitalresidue/waymark-gear/pulls?q=is%3Apr+is%3Amerged));
everything up to 2026-10-31 is also in [CHANGELOG.md](CHANGELOG.md). Feature
pull requests don't edit this file, so they don't collide with each other: it
changes only when the plan does.

---

## Phase 4 — Community & everyday polish (built 2026-10-26, see CHANGELOG.md)

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

## Phase 5 — Plan together (built 2026-10-26, see CHANGELOG.md)
- **Real-time collaboration**: invite partners or a group leader to one list (owner / editor / viewer); live edits and presence via WebSockets, building on the per-item sync from Phase 3.
- **Group gear**: who owns and carries what, so a group doesn't double-pack (seen on Packry).
- **Gear kits**: bundles you always carry together, added to any list in one click (Packstack).
- **Packed vs used**: after a trip, mark what you didn't use, to trim the next pack (Packry).
- **Quantity owned** warnings when a list uses more than you own (Packstack).
- Follow-ups: add gear from your own closet while planning someone else's list; viewer-only members; live updates across several app instances (Postgres LISTEN/NOTIFY).

## Phase 6 — The trip hub (built 2026-10-26, see CHANGELOG.md)
- **Trip journal**: trip "folders" with day-by-day entries (dated automatically or set by hand), photos, linked pack list; public, followers-only or private.
- **Gear reviews**: staff reviews first, then users; star rating, pros/cons, linked to catalog items and closet gear.
- **Trip details**: distance, elevation gain, terrain, expected temperatures (Packstack), feeding the trip planner.
- **Calorie and water estimates** with a safety margin, on top of today's trip planner.
- **Gear lifecycle**: condition, age and a replace-soon hint.
- Follow-ups: comments on trip journals; GPX upload for distance and elevation; reviews from the closet view; share images for trips.

## Phase 7 — Smarter gear (built 2026-10-26, see CHANGELOG.md)
- Comparisons, gear analysis (essentials, lighter options, readiness), wishlist, price history and alerts, affiliate links with a Supporter plan, MCP server and REST API.
- Follow-ups: price data from retailer feeds (today prices change when the owner updates the catalog); essentials tuned by trip type and season; MCP resources/prompts ("shakedown this list").

## Phase 8 — Trails and reach (Trails and phone web built 2026-10-26; native apps and languages next)
- **Trails page** (`/trails?t=pct`), the headline feature: one page with a trail picker (AT, PCT, CDT, Colorado Trail, JMT, Arizona Trail, Long Trail, …). Picking a trail reloads, in place:
  - the trail's facts and what it asks of your pack (bear canister in the Sierra, long water carries, snow gear);
  - live stats from every list tagged with that trail: number of packs, median and lightest base weight, share using quilts, trail runners, bear canisters, ice axes, satellite messengers;
  - the three most carried shelters, sleep systems, packs, insulation layers and shell layers (rain, snow, wind), ranked;
  - the packs themselves, sorted by top, lightest, newest, shakedown requests, or this year's class;
  - a trail-vs-trail table.
  **Picking a trail when there are thousands:** chips for the 6–8 trails with the most packs (your own trails first when signed in), then an **"All trails" search box**: type a few letters, get matches ranked by pack count, with aliases ("AT", "A.T.", "Appalachian") and region ("Colorado", "Scotland"). On a phone the chips scroll sideways and the search opens full screen. A `/trails/all` directory lists every trail by region and A–Z for browsing and search engines.
  **Where trails come from:** a curated trail list, like the gear catalog: the owner seeds the well-known long trails (Triple Crown, the other National Scenic Trails, the big state and international trails) with length, region and aliases, and imports more by CSV. When hikers type a trail that isn't there, it's kept on their list as written and counted; once a few people use the same name it shows up in the owner's queue to approve, merge into an existing trail, or ignore. That keeps "AT" and "Appalachian Trail" from splitting into two pages. Trails can have sections (PCT Section J) and overlaps (the JMT is part of the PCT), so a JMT list also counts toward the PCT's Sierra.
  Lists get an optional **trail** tag (with year and direction) next to the trip type; the editor suggests it from the list name. Each trail has its own link for search engines ("PCT gear list" is a big search). Nothing like this exists: Halfway Anywhere publishes a static PCT/CDT gear survey once a year; no list app groups real packs by trail. Mockup in the 2026-10-26 site tour.
- **Native apps** for iOS and Android (Capacitor around the existing PWA, so one codebase), with offline packing and push notifications. Both hikt and Packstack have them.
- **Languages**: translation framework and the first few languages (Spanish, French, German); hikt has 9.
- **Trip details from a place**: pick a trail or area and fill in distance, elevation and typical temperatures (Packstack does this with AI).
- **Trip journal follow-ups**: comments, GPX upload for distance and elevation, share images for trips.

---

## Competitors we watch
Re-checked 2026-10-26 after Phase 7.

| | Waymark Gear | Packstack | hikt | Packry | PackWizard |
| --- | --- | --- | --- | --- | --- |
| Closet, lists, weights, LighterPack import | ✓ | ✓ | ✓ | ✓ | ✓ |
| Gear catalog / weight autofill | ✓ | ✓ | – | – | ✓ |
| Kits, quantity owned | ✓ | ✓ (kits: Pro) | – | – | – |
| Trip details, calories, macros, water | ✓ | ✓ (Pro) | – | calories | – |
| Gear lifecycle / replace soon | ✓ | ✓ | – | – | – |
| Missing essentials, readiness, lighter options | ✓ | – | ✓ | – | suggestions |
| Comparisons, price history | ✓ | – | – | – | research tools |
| Wishlist, price-drop alerts | ✓ | – | wishlist | – | price tracking (planned) |
| Live co-editing, group gear | ✓ | multiple packs (Pro) | ✓ | ✓ | – |
| Packed vs used | ✓ | – | – | ✓ | – |
| Community: shakedowns, comments, votes, follows, profiles | ✓ | – | community lists | – | public lists |
| Trip journals, staff gear reviews | ✓ | gear reviews (articles) | – | – | – |
| MCP server for AI assistants, REST API | ✓ | ✓ (edits: Pro) | – | – | – |
| Native iOS/Android apps | PWA | ✓ | ✓ | – | – |
| Languages | 1 | 1 | 9 | 1 | 1 |
| Open source / self-host | ✓ | ✓ | – | ✓ | – |
| Paid by | affiliate links + $5 Supporter | Pro plan | – | free | affiliate links |

Where we stand: the broadest feature set of the five. Phase 8 adds the one
thing none of them has, pack lists grouped by trail, plus the reach the others
have and we don't: native apps and languages.

## Before launch (owner to-do)
- Merge PR #12 and deploy (migrations run automatically).
- Set VITE_CONTACT_EMAIL / VITE_SOURCE_URL; make the repo public or point the source link at a public mirror (GPL).
- Real Google OAuth client; Mailgun keys (resets and notification email).
- Fill in PRIVACY.md / TERMS.md placeholders; optional Cloudflare cache rule (DEPLOY.md).
- Review Dependabot majors one at a time (Node 26, config 5, nanoid 6, ESLint 10).
- Revenue: join affiliate programs and add rules (Owner → Revenue); set up Stripe products, keys and webhook (DEPLOY.md); fill in the Terms' affiliate and Supporter sections (operator name, price, refund policy).
