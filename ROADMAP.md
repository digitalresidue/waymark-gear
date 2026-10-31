# Waymark Gear roadmap

Living document. Each phase gets a dated entry in the changelog when it ships;
the plan below it is what comes next. Last updated **2026-10-28** (Phase 8 part 6: header tags; part 5: writing gear reviews, tidier list rows, optional Google Analytics; part 4: chart styles; part 3: the editor's rail, tools and account menu).

---

## Changelog

### Phase 8, part 27 — Category groups: Clothing over its layers · 2026-10-30 · branch `category-groups`
- A list can gather categories under a **group** heading, one level deep: Clothing over Base Layer, Mid Layer, Outer Layer, Shells. The heading shows the group's combined weight and a count, folds its categories away, renames in place, and **Ungroup** drops the heading but keeps the categories.
- Each category has a group button (folder icon): put it in a group, start a new one, or take it out. Dragging a category under a group's heading or between its categories joins it; dragging it out leaves. A group's categories always stay together, and a group with none left goes, so the list stays tidy.
- **Catalog layers group themselves**: added by type, a new Base Layer, Mid Layer, Outer Layer, Shells or rain-gear category goes in the list's Clothing group (made if needed). The API's "put gear in a list" does the same, and matches category names forgivingly too.
- **Everywhere**: the weight chart shows a group as one slice (opening it shows all its gear), the totals table and phone summary show the group's row over its categories, shared lists render the heading and indented categories, kit cards, the homepage hero and preview images count a group as one bar, the API says each category's `group`, and CSV export adds a `group` column (LighterPack's ten columns first) that import reads back.
- Stored as `pack_lists.category_groups` and `pack_list_categories.group_id` (migration `20261104000000_category_groups`); lists without groups save exactly as before.

### Phase 8, part 26 — Catalog gear joins the category you already have · 2026-10-30 · branch `category-matching`
- Adding catalog gear "by type" matched the list's categories by exact name, so a list with "Mid-layers" or "Midlayer" got a second "Mid Layer" category. Names now match ignoring case, spaces, hyphens, "&"/"and" and plurals (`categoryKey` in `client/utils/gear-meta.js`).

### Phase 8, part 25 — "Find us" on social, in the footer · 2026-10-30 · branch `footer-social`
- The site footer (app pages and server-rendered pages alike) has a **Find us** row: round icon links to the Facebook group, YouTube channel and Instagram, opening in a new tab with a clear label for screen readers.
- The accounts live in `client/brand.js` (`socialLinks`) beside the other site details, and the drawings in `client/social-icons.js`, so a fork can point them elsewhere or empty the list to hide the row.

### Phase 8, part 24 — Gear makers: a grid that ends on a full row · 2026-10-30 · branch `home-brands-grid`
- The homepage's brand grid fitted as many columns as the width allowed (7) but got 12 brands: one row of 7 and one of 5. It's now a fixed **7 across × 2 rows (14 brands)**, 4 × 3 on tablets and 2 × 4 on phones, leaving out brands past the last full row at that width.

### Phase 8, part 23 — Ready for Cloudflare's proxy · 2026-10-30 · branch `cloudflare-proxy`
- "Too many redirects" with the orange cloud on was Cloudflare's *Flexible* SSL mode looping with Caddy's own HTTPS redirect; the fix is **Full (strict)** in Cloudflare, now in INSTALL.md ("Optional: put Cloudflare in front", plus a troubleshooting entry).
- Behind Cloudflare the app would have seen Cloudflare's addresses as every visitor's, so per-IP limits would lump people together. Caddy now trusts Cloudflare's published ranges for `X-Forwarded-For` (`servers { trusted_proxies static … }`) and the app counts two proxies (`TRUST_PROXY: 2`): visitors' own IPs with the cloud orange or grey, and an address sent by anyone else is ignored. Tested with Caddy 2.10.2 in front of Express.
- `waymark update` restarts Caddy when a release changes its Caddyfile (and on a roll-back). The guide covers Cloudflare rate limiting for sign-in, register and password reset, AI-bot blocking, and Bot Fight Mode's catch: no exceptions on the free plan, so check Stripe deliveries and uptime monitors after turning it on.

### Phase 8, part 22 — "What people actually carry" filters by what people carry · 2026-10-30 · branch `common-gear-categories`
- The category chips were the catalog's first 8 categories alphabetically, so later ones (Packs, Shelter, Sleep…) never appeared. They're now the categories that show up most across published kits, most carried first (up to 12), from `GET /api/explore/common/categories`. With nothing carried yet, no chips are shown.

### Phase 8, part 21 — A spotlight kit in the homepage hero, rotating every 12 hours · 2026-10-30 · branch `hero-spotlight`
- The hero card shows a **random creator's public list**, the same for everyone for 12 hours, then another. A creator is picked first, then one of their lists, so prolific publishers don't crowd others out. Lists with 5+ items from visible profiles are preferred; a young site falls back to any list with gear.
- The pick is a hash of the 12-hour window (no stored state, so every server agrees). `GET /api/explore/spotlight` → `{ kit, until }`, cached until the pick changes (at most 5 minutes).
- The card is labelled **Spotlight**. The list name links to the list, the whole card opens it, and the creator's name still links to their profile.
### Phase 8, part 20 — Import from PackWizard and other apps · 2026-10-30 · branch `import-other-apps`
- **Import a list** (was "Import from LighterPack") takes a share link from **LighterPack or PackWizard**, a CSV file, or rows pasted from a spreadsheet.
- **PackWizard links** (`packwizard.com/s/…`) are read from PackWizard's public shared-pack JSON (only that one path on the configured `packwizardUrl`, no redirects, size-capped, rate-limited like LighterPack). Brands join the item name, units, quantities, prices, links and worn/consumable come across, and for someone signed in the item photos (up to 40) are copied here.
- **Other apps' CSV exports and spreadsheets** (Packstack, Google Sheets, Excel…): columns are found by name in many spellings (Gear/Item/Product, Brand, Group/Category, Notes, Count/Quantity, Weight (g), Cost, Type = worn/consumable…). The file can use commas, semicolons with decimal commas or tabs. Weights can carry a unit ("394 g", "1 lb 4 oz") or take it from the header. When nothing says the unit, the preview asks.
- The preview lists which column each field was read from. An imported list with photos or prices turns those columns on. A "Where do I find my list in other apps?" guide sits in the dialog. `/api/import/link` replaces `/api/import/lighterpack` (kept as an alias).

### Phase 8, part 19 — Packs by trail: twelve trails, each with how its packs split · 2026-10-30 · branch `trail-cards-stats`
- The homepage's **Packs by trail** shows **12** trails (was 8), ranked by published packs (sections count toward their trail; ties keep the curated AT, PCT, CDT… order).
- Each card has the **pack count** as a badge, a **weight-class bar** (Ultra-UL, Ultralight, Lightweight, Traditional, lightest on the left, with one legend under the grid) and the packs' **average base weight** (empty lists left out). A trail without packs says so and invites the first one.
- `/api/home` trails carry `classes` and `avgBaseWeightMg`, from one grouped query (`trails.packStats`). Phones get two compact columns.

### Phase 8, part 18 — "What people actually carry" links to the gear · 2026-10-29 · branch `common-gear-links`
- Each row in the homepage's most-carried gear list now opens that item's gear page (`/g/:id`): the name is the link and the whole row is the click target, with a hover highlight and a keyboard focus ring.

### Phase 8, part 17 — A daily sitemap that covers every public page · 2026-10-29 · branch `sitemap`
- `sitemap.xml` is now a **sitemap index** over files built **daily and at start-up** from the database (not by crawling: the database knows every public page): `pages.xml` (home, Explore, Brands, Gear reviews, Leaderboards, All trails, Support, Developers, Privacy, Terms, every trail) and numbered `gear-N`, `lists-N`, `people-N`, `trips-N` files — **gear pages and public trip journals were missing before**.
- Each file holds up to 40,000 links (the limit is 50,000), read a page at a time and written as it goes, so it scales to millions of pages without holding them in memory; a new set is swapped in only when complete. Drafts, hidden profiles and private pages never appear.
- **`waymark sitemap`** (`npm run sitemap:build`) rebuilds it now. INSTALL.md walks through submitting it to Google Search Console (verifying with Owner → Revenue → Header tags).

### Phase 8, part 16 — A homepage section for each part of the site · 2026-10-29 · branch `home-sections`
- The homepage now previews everything in the menu, each with a "See all" link: **Packs by trail** (the busiest trails, with pack counts), **Latest gear reviews** (the six newest: stars, gear, headline, the start of the review, who and when), **Gear makers** (brands, cottage makers first), and **Leaderboards** (top three voted and lightest), alongside the existing featured kits, shakedown board and popular gear. Order: hero, featured kits, trails, reviews, shakedowns, brands, popular gear, leaderboards, how it works.
- Sections with nothing to show yet stay hidden, so a new site doesn't look empty. One request (`GET /api/home`, cached a minute) feeds all four; one part failing leaves the rest.

### Phase 8, part 15 — Wide pages line up with the 1366px column · 2026-10-29 · branch `trails-width`
- **Trails** (and All trails), **Compare** and **profiles** use the site column like the header (1366px, 24px in), instead of their own 1120/1100/1040px boxes; the profile banner sits in the column on bigger screens (edge to edge on a phone). A test checks these pages and Brands line up with the header at both edges.
- Reading pages (gear items, Gear reviews, trip journals, shared lists) keep their narrower centred column for comfortable line lengths.

### Phase 8, part 14 — Where to buy: more shops per item · 2026-10-29 · branch `where-to-buy`
- Catalog gear can list **up to four more shops** besides its product link (Backcountry, Garage Grown Gear...), each with a normal link and an optional affiliate link. With more than one place to buy, **Buy opens a "Where to buy" menu** on the gear page and the compare page: each shop's badge (or initial), name and website. One place: a plain Buy link as before.
- **Badges** are copied to the server (never hotlinked) and kept once per shop website, shared by every item it sells; a shop without one gets its own site icon, fetched once a week at most, or its initial.
- **Import sheet**: `shop1_name, shop1_badge, shop1_url, shop1_affiliate_url` … `shop4_...`; a sheet without them leaves shops alone; export writes them back. **Editor**: "Also sold by", up to four rows.
- Every link goes through `/go/<item>?shop=N` with the same rule (affiliate link, shop rule, or the plain link for Supporters); clicks record the shop. No affiliate links in the public catalog API.

### Phase 8, part 13 — A wider site, a roomier gear panel, visible sideways scrolling · 2026-10-29 · branch `wider-site`
- **The site column is 1366px** (was 1200px), header, footer, editor and every page in it alike; the editor still lines up with the header at both edges.
- **The editor's side panel is 380px** on big screens (was 300px): 320px up to 1365px wide windows, 270px up to 1180px. Gear names in the Closet and Catalog get the room; catalog names also wrap to a second line instead of being cut off.
- **Rows that scroll sideways say so**: the edge with more fades out and a round ‹ / › button sits on it (and scrolls the row). Catalog panel and "Add gear" picker categories, the phone Gear filters, and on phones the Brands and Trails chips. One component (`scroll-row.vue`) for the app, one helper (`utils/scroll-row.js`) for server pages, shared styles.

### Phase 8, part 12 — Empty closet; unused images cleaned up · 2026-10-29 · branch `empty-closet`
- **Empty** on the closet (desktop sidebar and the phone Gear screen) asks first: delete **only the gear no list uses** (offered first), or **everything**, which also empties your lists (their categories stay). Says how many of each; can't be undone.
- **Unused images are deleted automatically, once a day.** Every text and JSON column in the database is searched (in SQL) for stored-image paths, so list gear, gear photos, the catalog, brand logos, avatars, banners, trip photos and any future feature are all covered without a list to maintain; stored files nothing refers to, more than a day old (an upload not saved yet is safe), go, with their other sizes. One run at a time across instances (Postgres advisory lock); refuses to delete more than half of all images in one go unless forced. Images can be shared (catalog photos in everyone's lists, copied lists), which is why this is a sweep rather than deleting at the moment something is removed.
- **`waymark clean-images`** (`npm run images:clean`) runs it now; `--dry-run` only reports. Setting: `imageCleanup.enabled`.

### Phase 8, part 11 — Catalog in the editor's rail · 2026-10-29 · branch `catalog-panel`
- **Catalog** sits under Lists and Closet in the editor's left rail. Its panel searches the shared gear catalog (with category chips), shows each item's photo, brand, type and weight, and adds it to the list being edited with one click; the name opens its gear page.
- **Add to: Its type** (the default) files gear under the list's category of that type — a tent under Shelter — making the category if the list hasn't got one (a brand-new list's empty starter category takes the name). Or pick one of the list's categories. Remembered per browser.
- Gear added this way stays linked to the catalog, like "Add from catalog". Choosing another list from the panel's Switch comes back to the catalog.

### Phase 8, part 10 — "@name" goes to the profile · 2026-10-29 · branch `profile-links`
- On kit cards (homepage featured kit, Explore and homepage kit lists, shakedown cards), Leaderboards and Trails pack cards, **the hiker's @name links to their profile**. The rest of the card still opens the list (the title link stretches over the card; the name sits above it, since links can't nest). Cards are no longer one big link, which also reads better with screen readers.

### Phase 8, part 9 — Your picture in the header · 2026-10-28 · branch `header-avatar`
- The account button at the top right shows **your profile picture** instead of your initial once you've added one (Your profile), on every page, in the app and on server-rendered pages, and changes as soon as you save a new one. No picture: the initial, as before.

### Phase 8, part 8 — Image links are copied, not hotlinked · 2026-10-28 · branch `local-images`
- **Pasted image links are copied to Waymark**, fit within **512×512** (plus a 180px thumbnail), as webp: list item photos ("Add image by URL"), catalog gear photos (editor and CSV import) and brand logos. Pages never load images from the shop's own site.
- Catalog photos are copied when an item is saved, and in the background after an import. **Owner → Gear catalog** shows how many photos still load from other sites (older items, or links that failed), with **Copy them now** and a list of any that couldn't be copied. Lists using catalog gear pick up the copy through the catalog link.
- The server fetches only public internet addresses on the standard ports (private, loopback and cloud-metadata ranges refused; the checked address is the one connected to; each redirect checked), at most 8 MB in 10 s, and only real JPEG/PNG/WebP. Copies for catalog gear and logos are site content, so they outlive any one account. 20 copies a minute per person.
- Photo links people pasted into their own lists before this keep working as they are; pasting one again copies it.

### Phase 8, part 7 — Brands directory · 2026-10-28 · branch `brands`
- **`/brands`** (Explore ▾ → Brands): gear makers as cards with logo (or a monogram), a short description, a Cottage badge, country, and what they make. Search by name, **Cottage makers only**, and gear-type filters (shelters, sleep, packs, insulation, shells, clothing, footwear, cooking, water, electronics, poles, navigation, accessories). Filters apply in place and keep the URL in step; the same URL works without JavaScript. In the sitemap.
- **Visit** goes through `/go/brand/:id`, like catalog Buy buttons: the brand's affiliate link when it has one (or a matching affiliate rule), its website for Supporters and when affiliate links are off. Visits are counted per day (no personal data).
- **Owner → Brands**: add, edit and delete brands, upload a logo (or paste an https link), draft or published, with visits over the last 30 days. Saying who gets which link in words, as the catalog editor does.

### Phase 8, part 6 — Header tags · 2026-10-28 · branch `head-tags`
- **Owner → Revenue → Header tags**: paste up to 10 `<meta>` verification tags (Impact, Google Search Console, Pinterest...), one per line; they go into the `<head>` of every page the server sends, at once, no restart. Only `name`/`property`/`itemprop` with `content`/`value` are accepted (no scripts, no `http-equiv`); each tag is rebuilt and escaped, not echoed as pasted. Stored in `site_settings`.

### Phase 8, part 5 — Writing gear reviews, list rows, Analytics · 2026-10-28 · branch `reviews-writing`
- **A way in**: reviews are written on each gear page, but nothing led there. Now reviewers (owners, moderators, the `reviewers` setting, or everyone with `openReviews`) get a **Write a review** panel at the top of `/reviews`: search the catalog, or pick from **suggestions** — the most-carried published gear you haven't reviewed yet. Members and visitors don't see it.
- Also reachable from **Owner ▾ → Write a review**, and a **Review** button on each published item in the owner's gear catalog.
- Every route lands on the gear page at `#write-review` with the review form **open and focused**.
- `/api/viewer` now says whether you can review; new `GET /api/reviews/suggestions`.
- The empty state on `/reviews` says where reviews are written.
- **List rows**: with Item images on, every row used to reserve a 90px photo column, photo or not. Now photos are a **25px clickable thumbnail**, and the column only exists when the category has a photo (shared lists too). Name and description share the room evenly, and the drag handle and remove ✕ sit inside the category card again.
- **Optional Google Analytics**: set `GA_MEASUREMENT_ID` in `waymark settings` (INSTALL.md, "Optional: Google Analytics"). Off unless set. Google's script loads after the page has finished, when the browser is idle; visitors sending Global Privacy Control or Do Not Track are skipped, and embeds never load it. The security policy allows Google only when it's on, and the privacy page switches to wording that says Analytics is used.
- **Cookie consent where the law asks for it**: in the EU/EEA, UK and Switzerland (guessed from the browser's time zone; unknown zones are asked) a banner asks first. Analytics starts unticked, and "Reject all", "Save choices" and "Accept all" are identical buttons. Nothing from Google loads before a yes (Consent Mode v2: ads always denied, `analytics_storage` follows the choice). Everyone can change it under **Cookie settings** in the footer; withdrawing clears Google's cookies. US state laws are opt-out, and Global Privacy Control already switches Analytics off.
- This branch also carries part 4 (chart styles), which had merged into `list-drawer` after that branch was already in `main`.

### Phase 8, part 4 — Chart styles · 2026-10-28 · branch `chart-styles`
- **Donut, Bars or Treemap** for the weight chart, picked under it. Bars sort categories largest first; the treemap sizes blocks by weight, with labels in whichever ink reads on each color. Like the donut, both highlight the category in the totals on hover and open a category into its items on click (with a way back).
- **It sticks**: saved with the account (library preferences) and remembered in the browser, so **other people's shared lists draw in your style** too; on a new device, a shared list asks the account. Visitors who haven't chosen see the donut. The phone summary panel has the same choice.

### Phase 8, part 3 — A calmer list editor · 2026-10-28 · branch `list-drawer`
- **Icon rail + one panel** on the desktop: the left column no longer stacks your lists over your closet. A slim rail (Lists, Closet, Pack, and a collapse button) sits beside one panel. Choosing a list (or making a new one) puts the lists away and gives the **closet the whole column**, headed by the list you're adding to; "Switch" opens the lists again in the same spot, so the two toggle without the pointer landing on anything else.
- Clicking the open panel's icon, or the collapse button, **puts the panel away and keeps the rail**, so the list gets the room and one click brings it back. Which panel was showing is remembered per browser; open or put away follows the account.
- Phones keep the existing drawer and closet page.
- **All the list tools in the rail**: Pack, Print, Team, Share and Settings sit under Lists and Closet (Share and Settings open beside it), so the editor's header is just the list's title (long names fit) and who's here.
- **Bell and account menu in the site header on every page** (also the server-rendered ones), in place of the username and "Open my lists"; **My lists** is the first thing in the account menu. Account Settings and Help open from anywhere.
- **The editor lines up with every page**: it sits in the site's 1200px column, the rail under the logo and the list ending at the header's right edge, with the panel open or put away.
- Fix: putting the sidebar away never stuck after a reload (a saved `false` was read as "not set").

### Phase 8, part 2 — One menu everywhere, clearer links · 2026-10-28 · branch `nav-affiliate`
- **A shorter main menu**: My lists · Explore ▾ (Kits, Trails, Leaderboards, Gear reviews) · Trips · Owner ▾ (Gear catalog, Featured kits, Trails, Revenue, Users, Tickets). Dropdowns open on hover, click or keyboard; on a phone they become labelled sections of the menu sheet. Defined once (`client/nav.js`) for every page.
- **Every page has the site header and footer**, including the server-rendered ones (Trails, shared lists, profiles, gear pages, trips, compare), which used to have a bare bar. They're cached and shared, so the signed-in parts (Trips, Owner, your name, "Open my lists") fill in from a small `/api/viewer` call.
- **The homepage is reachable when signed in**: the logo always goes to it (and in the editor's phone drawer), with My lists in the menu.
- **Owner → Users** (moderation) uses the owner layout: header, owner tabs, cards, footer; the search handles `+` in emails. All owner pages now have the footer.
- **Product link and affiliate link**: catalog items keep the normal store page and, optionally, the network's tracking link (AvantLink and Impact links don't look like the product). Supporters always get the product link; everyone else the affiliate link when there is one, otherwise the product link (with a shop rule's code if one matches). An affiliate link now needs a product link beside it; the editor says what Buy will do for each item, the catalog marks items with an affiliate link, and the CSV template shows both columns.

### Phase 8, part 1 — Trails, and the phone web · 2026-10-26 · branch `phase8`
- **Trails page** (`/trails/pct`): what people carry on a trail. The trail's facts and what it asks of your pack; packs, median and lightest base weight; how many use quilts, trail runners, bear canisters, ice axes, satellite messengers; the three most carried shelters, sleep systems, packs, insulation layers and shell layers (rain, snow, wind), ranked; every pack, sorted by top, lightest, newest, shakedown requests or this year's class; and the trail against the two most-packed others.
- **Picker** that scales to thousands of trails: chips for the 8 most-packed trails (your own trails first, starred), and a search that finds any trail by name, nickname or place. Switching trails or sorts swaps the page in place (with working Back), while every trail keeps its own link for search engines. `/trails/all` lists every trail by country; trail pages are in the sitemap.
- **Curated trail list**, seeded with about 40 long trails (Triple Crown, National Scenic Trails, popular routes in Canada, Europe, New Zealand, Australia, Nepal), with nicknames, regions, lengths, sections and "what it asks of your pack" notes.
- **Trail tag on lists**: next to the trip type, with year and direction (NOBO, SOBO, flip-flop, section). A list named "PCT 2026" offers the tag in one tap. Shared lists link to their trail. The API and MCP tools report it.
- **Owner → Trails**: edit trails, and a queue of names hikers typed that match nothing yet: add as a trail, merge into an existing one (it becomes a nickname, and those lists join the trail), or ignore.
- **Phone web**: the header is one row (logo, bell, one button, menu) with the links in a menu sheet, instead of two or three rows of links; the public pages' bar the same, with a menu that works without JavaScript. Less padding on the homepage, Explore and page headings; the trip-type chips scroll in one row; the gear page puts a small thumbnail beside the name; the revenue rules stack.
- Fixes: the closet's selected filter chip was white on white; lighter-option search now sends item descriptions.

### Phase 7 — Smarter gear, and paying for the site · 2026-10-26 · branch `phase7`
- **Gear check** on every list: a readiness score (0–100) from twelve essentials (shelter, sleep, warm layer, water treatment, navigation, light, first aid count most; rain, sun, fire, knife/repair, emergency signal less), adjusted for day hikes and for cold or hot trips. Mark any essential "not needed" for that list. **Lighter options** from the catalog, with the weight each saves and how many public lists use it, and **what other hikers carry** in each of your categories.
- **Wishlist**: gear you want, kept in the closet but apart from it; add from the gear check, a gear page or a comparison; "Got it" moves it into your closet.
- **Price history** on catalog items (every price change the owner makes is kept), with the lowest price seen; **price-drop alerts** for wishlist gear, in the app and by email.
- **Compare** up to four catalog items side by side at `/compare`: weight, price, lowest price, rating, how many lists use it.
- **Calorie estimate** now gives carbs, fat and protein, and totals for the whole trip.
- **Affiliate links**: Buy buttons on gear pages, comparisons and shared lists go through `/go/<item>`, which adds the shop's affiliate code (per-item link, or site-wide rules per shop) and counts clicks for the owner (Owner → Revenue). Commission notice next to every Buy button; full disclosure in the Terms. Suggestions are never ranked by commission.
- **Supporter plan**: $5 a month or $48 a year through Stripe Checkout, managed in Stripe's portal. Supporters get plain links and a profile badge; owners can grant it by hand.
- **AI assistants and API**: an MCP server at `/mcp` so Claude, ChatGPT and others can read your closet and lists, run the gear check, search the catalog, and (if you allow it) add and change gear. Assistants connect by signing in (OAuth 2.1 with PKCE); personal tokens (read or read-and-write) work too. REST API at `/api/v1` (API.md). Manage both at `/developers`.

### Phase 6 — The trip hub · 2026-10-26 · branch `phase6`
- **Trip journals** (`/trips`): a trip with dates, a summary, a linked pack list and a cover photo, plus day-by-day entries (dated automatically from the start date, or set by hand) with notes, distance and up to 8 photos each. Each trip is public, followers-only or private. Public page at `/t/:id` (photos open in the lightbox) and a Trips tab on profiles; followers-only trips show only to followers. Photos must be your own uploads.
- **Gear reviews**: catalog items get a page at `/g/:id` with specs, average rating, how many public lists use it, and reviews (rating, headline, "used for", liked / didn't like). Staff write them: owners, moderators and anyone in the new `reviewers` setting; turn on `openReviews` to let every member review (marked "Member", listed after staff). Moderators can hide a review. Latest reviews at `/reviews`; closet items from the catalog link to their page.
- **Trip details** in the trip planner: distance, elevation gain, terrain, expected low/high and your weight (in your units).
- **Calorie and water estimates** from those details, with a 10% safety margin, and a "Use this for food per day" button that feeds the planner.
- **Gear lifecycle**: when you bought it, condition and expected life in gear details; a "Replace soon" tag in the closet when it's past its life or marked as needing replacement.

### Phase 5 — Plan together · 2026-10-26 · branch `phase5`
- **Real-time collaboration**: invite hiking partners or your group to a list (Team button). Members open it at `/plan/:owner/:list` in the regular editor and everyone's edits appear live; "Shared with you" in the list switcher; invite notifications. Server-sent events carry changes and presence ("here now" faces in the header). Members can only touch that one list: publishing, sharing, other lists and the rest of the owner's closet stay the owner's (enforced on the server).
- **Group gear**: "Who carries what" panel on shared lists, with pack weight per person; Pack mode can show only what you carry.
- **Gear kits**: save a category as a kit (cook kit, first aid…) and add it to any list in one click.
- **Packed vs used**: Pack mode "After the trip" marks what you didn't use, and totals the weight you carried for nothing.
- **Quantity owned**: set how many you own in gear details; lists flag a quantity higher than that.
- **"New" banner** on shakedown cards asked for in the last 8 hours (homepage board and Explore).
- Fix: a non-edit store update arriving right after an edit (e.g. a presence change) could cancel that edit's save.

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

## Phase 5 — Plan together (built 2026-10-26, see changelog)
- **Real-time collaboration**: invite partners or a group leader to one list (owner / editor / viewer); live edits and presence via WebSockets, building on the per-item sync from Phase 3.
- **Group gear**: who owns and carries what, so a group doesn't double-pack (seen on Packry).
- **Gear kits**: bundles you always carry together, added to any list in one click (Packstack).
- **Packed vs used**: after a trip, mark what you didn't use, to trim the next pack (Packry).
- **Quantity owned** warnings when a list uses more than you own (Packstack).
- Follow-ups: add gear from your own closet while planning someone else's list; viewer-only members; live updates across several app instances (Postgres LISTEN/NOTIFY).

## Phase 6 — The trip hub (built 2026-10-26, see changelog)
- **Trip journal**: trip "folders" with day-by-day entries (dated automatically or set by hand), photos, linked pack list; public, followers-only or private.
- **Gear reviews**: staff reviews first, then users; star rating, pros/cons, linked to catalog items and closet gear.
- **Trip details**: distance, elevation gain, terrain, expected temperatures (Packstack), feeding the trip planner.
- **Calorie and water estimates** with a safety margin, on top of today's trip planner.
- **Gear lifecycle**: condition, age and a replace-soon hint.
- Follow-ups: comments on trip journals; GPX upload for distance and elevation; reviews from the closet view; share images for trips.

## Phase 7 — Smarter gear (built 2026-10-26, see changelog)
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
