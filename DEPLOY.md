# Deploying Waymark Gear to waymarkgear.com

> **New to servers?** Start with [INSTALL.md](INSTALL.md): a step-by-step
> DigitalOcean install that a setup script does most of. This file is the
> reference behind it: running your own image, Google sign-in, payments,
> Cloudflare and other hosts.

This guide takes you from this repository to a live, HTTPS site with Google
sign-in, email, and nightly backups. Plan on an afternoon the first time.

## What you need

| Service | What it's for | Suggested | Notes |
| --- | --- | --- | --- |
| **GitHub** | Code, CI tests, and the Docker image registry | github.com | Free for this use. |
| **Domain** | waymarkgear.com | Your registrar | Point DNS at the server (step 3). Cloudflare DNS is a good free option. |
| **A server** | Runs the app, database and HTTPS | Any VPS with Docker: DigitalOcean, Hetzner, Linode/Akamai, Vultr | 2 vCPU / 2–4 GB RAM / 50 GB disk is plenty to start. Ubuntu 24.04 LTS. |
| **PostgreSQL** | All user data | Included in the compose stack | Or a managed database (DigitalOcean Managed Postgres, Neon, Supabase) for automatic point-in-time backups; set `DATABASE_URL` and drop the `db` service. |
| **HTTPS** | Certificates | Caddy, included | Automatic Let's Encrypt certificates and renewal. |
| **Google Cloud** | "Continue with Google" | console.cloud.google.com | Free. Step 4. |
| **Email** | Password-reset and forgot-username emails | Mailgun | The code talks to Mailgun's API. Step 5. |
| **Off-site storage** | Backups | Backblaze B2, AWS S3, or DigitalOcean Spaces | Step 8. |
| **Uptime monitor** | Tells you if the site goes down | UptimeRobot or Better Stack (free tiers) | Monitor `https://waymarkgear.com/healthz`. |

The server needs outbound HTTPS to `lighterpack.com` and `www.packwizard.com` for "Import a list" share links (file uploads and pasted rows work without it). It only ever requests LighterPack's public `/csv/:id` and `/r/:id` pages and PackWizard's public `/api/packs/getSharedPackWithId?shareableId=:id`, never follows redirects, and is rate limited per IP (`rateLimit.importMaxPerWindow`, default 20 per 10 minutes). For someone signed in, photos on a PackWizard list (up to 40) are copied here like any pasted image link. `LIGHTERPACK_URL` and `PACKWIZARD_URL` override the addresses if you ever need to.

Check each provider's current pricing; a small VPS, storage and a domain are
the only recurring costs at launch.

## 1. Put the code on GitHub

1. Create an empty **private or public** repository, e.g. `waymark-gear`
   (no README, no license — the repo already has them).
2. Push this code:
   ```sh
   git remote add origin git@github.com:YOUR-USER/waymark-gear.git
   git push -u origin main
   ```
3. Open the **Actions** tab. The **CI** workflow runs lint, unit tests, a
   build, a dependency audit, end-to-end tests in Chromium and Firefox, and a
   Docker build. When it passes on `main`, **Release image** publishes
   `ghcr.io/your-user/waymark-gear:latest`.
4. Under **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_CONTACT_EMAIL` — e.g. `hello@waymarkgear.com` (shown in the footer)
   - `VITE_SOURCE_URL` — your repo URL (the GPL requires offering the source)

   Re-run the Release workflow after adding them.
5. If the repository is private, the server needs to log in to pull the image:
   create a **fine-grained personal access token** with *read packages*, then on
   the server run `docker login ghcr.io -u YOUR-USER` and paste it. (Or make
   the package public under your profile → Packages → waymark-gear → Settings.)

## 2. Create the server

1. Create an Ubuntu 24.04 VPS and add your SSH key.
2. Install Docker and lock the server down:
   ```sh
   ssh root@SERVER_IP
   curl -fsSL https://get.docker.com | sh
   apt-get install -y ufw unattended-upgrades
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   dpkg-reconfigure -plow unattended-upgrades
   ```
3. Turn off password SSH logins (`PasswordAuthentication no` in
   `/etc/ssh/sshd_config`, then `systemctl restart ssh`).

## 3. Point the domain at it

At your DNS provider create:

| Type | Name | Value |
| --- | --- | --- |
| A | `waymarkgear.com` (or `@`) | SERVER_IP |
| A | `www` | SERVER_IP |

(Add matching `AAAA` records if your server has IPv6.) If you use
Cloudflare, start with the records set to **DNS only** (grey cloud) so Caddy
can get its certificate; see "Optional: Cloudflare" below for proxying.

## 4. Set up Google sign-in

1. Go to **console.cloud.google.com**, create a project named *Waymark Gear*.
2. **APIs & Services → OAuth consent screen**: choose *External*. Fill in app
   name *Waymark Gear*, your support email, the logo, and:
   - Application home page: `https://waymarkgear.com`
   - Privacy policy: `https://waymarkgear.com/privacy`
   - Terms of service: `https://waymarkgear.com/terms`
   - Authorized domain: `waymarkgear.com`
   - Scopes: `openid`, `email`, `profile` (nothing sensitive, so no review).
   Publish the app (move it out of *Testing*) when you launch.
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://waymarkgear.com`
   - Authorized redirect URIs: `https://waymarkgear.com/auth/google/callback`
4. Copy the **Client ID** and **Client secret** into the server's `.env`
   (step 6). The Google button appears only when both are set.

## 5. Set up email (Mailgun)

1. Create a Mailgun account and add the sending domain `mg.waymarkgear.com`.
2. Add the DNS records Mailgun shows (SPF, DKIM, and MX/CNAME tracking if you
   want it) at your DNS provider; wait until Mailgun shows them verified.
3. Create a **sending API key** and put it in `.env` as `MAILGUN_API_KEY`,
   with `MAILGUN_DOMAIN=mg.waymarkgear.com`.

## 6. Start the site

The quickest way is the setup script ([INSTALL.md, step 5](INSTALL.md#step-5-run-the-setup)).
It does step 2's hardening and this step, and installs the `waymark`
command. To use your own image, set it first:

```sh
curl -fsSL https://get.docker.com | sh
docker login ghcr.io -u YOUR-USER          # only if the image is private
docker run --rm ghcr.io/your-user/waymark-gear:latest cat deploy/install.sh > install.sh
WAYMARK_IMAGE=ghcr.io/your-user/waymark-gear:latest bash install.sh
```

By hand instead:

```sh
mkdir -p /opt/waymark && cd /opt/waymark
# copy from the repo's deploy/ folder:
#   docker-compose.prod.yml, Caddyfile, .env.production.example
cp .env.production.example .env && chmod 600 .env
nano .env        # SITE_DOMAIN, APP_IMAGE, POSTGRES_PASSWORD (openssl rand -hex 24), ADMINS
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f app   # watch it start
```

`SITE_DOMAIN` drives both Caddy (the certificate, and redirecting `www.` to
the bare domain) and the app's public URL, so it's the only place the domain
goes. Open `https://your-domain` — Caddy fetches the certificate on the
first request, which can take a few seconds.

## 7. Make yourself the owner and load the catalog

1. The setup script creates your owner account. By hand: register on the
   site, put your username in `.env` as `ADMINS=["yourusername"]`, then
   `docker compose -f docker-compose.prod.yml up -d`.
2. Sign in. **Owner → Gear catalog → Download CSV template**, fill it in
   (one row per product; weight with a unit of `g`, `kg`, `oz` or `lb`), then
   **Import CSV**. Review what will be added or changed, and **Apply**.
   Packs, tents, quilts, pads, sleeping bags and insulated layers can carry
   specs too (see "Gear specs" below).
4. Before launch, finish `PRIVACY.md` and `TERMS.md` (replace every
   `[bracketed]` item and remove the draft notes), and replace the remaining
   LighterPack artwork in `public/images/` (background images and the welcome
   screenshot). Commit and push — the next release picks them up.

## 8. Backups

The setup script schedules `backup.sh` every night (`/etc/cron.d/waymark`):
a compressed database dump and the uploaded photos, kept 14 days in
`/opt/waymark/backups`. `waymark offsite` adds an rclone copy off the server,
and `waymark restore <date>` puts one back ([INSTALL.md, "Backups"](INSTALL.md#backups)).
**Test a restore** once: a backup you haven't restored is a guess.

## 9. Shipping updates

1. Push to `main`. CI runs; on success a new image is published.
2. On the server: `waymark update`. It backs up, pulls the image, refreshes
   the `deploy/` files from it (adding any new settings to `.env` as
   comments), restarts, and rolls back to the previous image if the new one
   doesn't come up healthy. Database migrations run automatically on start,
   and the app shuts down gracefully, so in-flight saves finish first.
3. To pin or roll back by hand, set `APP_IMAGE` to a commit's tag
   (`ghcr.io/your-user/waymark-gear:<sha>`) with `waymark settings`.

Dependabot opens weekly pull requests for dependency updates; merging them
after CI passes keeps security patches current.

## Security checklist

- [ ] `NODE_ENV=production` (set in the compose file): secure cookies, HSTS.
- [ ] `TRUST_PROXY=2` (set in the compose file): Caddy, plus Cloudflare when
      proxied. Caddy only accepts forwarded addresses from Cloudflare's ranges.
- [ ] Strong `POSTGRES_PASSWORD`; the database port is never published.
- [ ] `.env` is `chmod 600` and never committed.
- [ ] Firewall allows only 22, 80, 443; SSH keys only; unattended upgrades on.
- [ ] Backups running and a restore tested.
- [ ] Uptime monitor on `/healthz`.

## Traffic spikes and Cloudflare

When a kit gets posted to a big forum or subreddit, thousands of people open
the same page within minutes. The app handles that on its own:

- Shared lists (`/r/…`) and profiles (`/@…`) are rendered at most about once
  a minute per page and served from memory in between. An owner's own pages
  are refreshed the moment they save or edit their profile.
- Link-preview images (`/og/…`) are drawn once and cached; built assets under
  `/dist/` are content-hashed and cached by browsers for a day.
- Every response sends ETags, so repeat visitors get a cheap `304`.

To go further, proxy through Cloudflare (orange cloud); INSTALL.md,
"Optional: put Cloudflare in front", has the steps. In short: SSL/TLS mode
**Full (strict)** (Flexible loops forever with "too many redirects", because
Caddy already sends plain HTTP to HTTPS), and keep the origin firewall as
above. Nothing changes on the server: Caddy trusts Cloudflare's published
address ranges (`deploy/Caddyfile`) and the app counts two proxies
(`TRUST_PROXY: 2`), so per-IP limits see each visitor's own address rather
than Cloudflare's, and nobody else can supply a fake one. If Cloudflare ever
publishes new ranges (cloudflare.com/ips), add them to the Caddyfile.

Cloudflare doesn't cache HTML by default, so add a **Cache Rule**:

- **When:** URI Path starts with `/r/`, or starts with `/@`, or starts with
  `/og/`, or starts with `/dist/`, or starts with `/api/explore/` (the
  homepage and Explore read their kits from there)
- **Then:** Eligible for cache; Edge TTL: *Use cache-control header if
  present*; Browser TTL: *Respect origin*.

Pages send `s-maxage=60`, so the edge serves them for a minute and the
origin sees about one request per page per minute per data center. Don't add
`/`, `/api/`, `/profile` or anything signed-in: those are personal. After a
deploy you can **Purge Everything** so no edge keeps a page that points at
the previous build's assets for its last minute.

If you ever run more than one app instance, each keeps its own page cache;
another instance may show a page up to a minute old.

## Live updates

Planning a list together updates everyone's screen live over server-sent
events (`/api/live`): one long-lived request per open tab, with a ping every
25 seconds so proxies don't close it. Caddy streams these without extra
settings, and Cloudflare passes them through (its 100-second idle timeout is
covered by the ping). Leave `/api/` out of any cache rule.

Live updates are in-memory in the app process. With a single app instance
(the default compose stack) nothing else is needed. If you scale out to
several instances, add a shared message bus between them (Postgres
LISTEN/NOTIFY is the simplest) in `server/live.js`.

## Supporter plan and affiliate links

Waymark pays for itself two ways: affiliate links on catalog gear, and the
Supporter plan ($5 a month or $48 a year), whose members get plain links and a
profile badge. Both are off until you set them up.

**Affiliate links.** Join the programs you want (Amazon Associates, AvantLink
for REI and many outdoor brands, Impact, a brand's own program). Every
catalog item keeps two links:

- **Product link** (`url` in the CSV): the normal store page. Supporters
  always get this one, and it's the one people can read.
- **Affiliate link** (`affiliate_url`, optional): the tracking link the
  network gives you. AvantLink and Impact links don't look like the product
  (`https://www.avantlink.com/click.php?...`, `https://brand.sjv.io/c/...`),
  which is why they go in their own column rather than replacing the
  product link. An item with an affiliate link must have a product link too.

Who gets what when they click Buy:

| Reader | Item has an affiliate link | No affiliate link |
| --- | --- | --- |
| Supporter | Product link | Product link |
| Everyone else | Affiliate link | Product link, with your shop rule's code added if one matches its site |

**Where to buy: more shops.** Gear is often sold by general stores too
(Backcountry, Garage Grown Gear, REI). Each item can list up to **four more
shops** besides its product link, and Buy then opens a "Where to buy" menu of
them all (one place to buy is still a plain Buy link). Per shop, the CSV has
four columns, `shop1_name, shop1_badge, shop1_url, shop1_affiliate_url`
through `shop4_...`, and the catalog editor has the same under "Also sold by":

- **Name**: what the menu shows (blank: the shop's website).
- **Badge**: a link to the shop's logo. It's copied to your server (never
  loaded from theirs) and kept once per shop website, so it's used on every
  item that shop sells; leave it blank and Waymark tries the shop's own site
  icon, or shows its initial.
- **Link** and **affiliate link**: the same rules as the product link above,
  per shop, including your shop rules.

Leave the shop columns out of a CSV and items keep the shops they have.

Shop rules (**Owner → Revenue → Affiliate rules**) cover programs that work
by adding a parameter, e.g. domain `amazon.com`, parameter `tag`, value
`yourtag-20`, so you don't need an affiliate link per Amazon item. The
catalog editor says, for each item, which link its Buy button will use.

Buy buttons go through `/go/<item>`, which picks the link per reader and counts
clicks (Owner → Revenue). Every page with Buy buttons carries a short
commission notice, and TERMS.md has the full disclosure; keep both. Amazon's
rules also forbid its links in email, which is why price-drop emails link to
the gear page instead.

**Stripe.**

1. Create a Stripe account. In **Product catalog**, add a product "Waymark
   Supporter" with two recurring prices: $5 / month and $48 / year. Copy both
   price ids (`price_…`) into `.env` as `STRIPE_PRICE_MONTHLY` and
   `STRIPE_PRICE_YEARLY`.
2. **Developers → API keys**: put the secret key in `STRIPE_SECRET_KEY`. (A
   restricted key needs write access to Checkout Sessions and Customer portal
   and read access to Subscriptions.)
3. **Developers → Webhooks → Add endpoint**: `https://waymarkgear.com/stripe/webhook`,
   events `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Put its
   signing secret in `STRIPE_WEBHOOK_SECRET`.
4. **Settings → Billing → Customer portal**: turn on cancelling and switching
   between the two prices.
5. If you charge other amounts, set `SUPPORTER_MONTHLY_LABEL` and
   `SUPPORTER_YEARLY_LABEL` to the prices as people should read them (e.g.
   `€5`); they're only labels, Stripe's prices are what's charged.
6. `docker compose -f docker-compose.prod.yml up -d`. The Subscribe buttons
   appear at `/supporter`. Try it first with test-mode keys and Stripe's test
   card 4242 4242 4242 4242.

To give someone Supporter for free (a contributor, a reviewer): Owner →
Revenue → Supporters.

## Gear specs

Catalog gear of these types can carry specs: a pack's volume and frame, a
tent's size and pitch, a quilt's ratings and fill, and so on. They show on
the gear page, come out of the API (`/api/catalog?spec_pitch=freestanding`,
`spec_trail_weight_max=2lb`, `spec_temp_limit_max=20F`...; choices take a
comma list, measures `_min` and `_max`), and will drive gear search and
filters.

Fill them in from **Owner → Gear catalog** (the item editor shows the
fields for its category) or the import sheet: one column per field, named
below, read only for rows of that type. Measurements take either unit and
are shown in both; a bare number means the unit in brackets. Fill power and
RDS are kept only for down. A spec column left empty clears that spec; a
sheet without spec columns leaves specs as they are.

**Pack** (category "Pack", "Backpack", "Rucksack", any spelling or plural)

| Column | Field | Value |
|---|---|---|
| `volume` | Volume | `40 L` or `2440 cu in` (bare number: L) |
| `max_carry` | Max carry weight | `14 oz` or `397 g` (bare number: lb) |
| `frame` | Frame | Framed / Frameless |
| `strap_type` | Shoulder straps | J-curve / S-curve / Vest / Other |
| `roll_top` | Roll top | yes / no |
| `adjustable_torso` | Adjustable torso | yes / no |

**Tent** (category "Tent", any spelling or plural)

| Column | Field | Value |
|---|---|---|
| `capacity` | Size | 1P / 1P+ / 2P / 2P+ / 3P |
| `pitch` | Pitch | Trekking pole / Semi-freestanding / Freestanding |
| `trail_weight` | Trail weight | `14 oz` or `397 g` (bare number: oz) |
| `min_weight` | Minimum weight | `14 oz` or `397 g` (bare number: oz) |
| `double_wall` | Double walled | yes / no |
| `vestibules` | Vestibules | number (whole) |
| `floor_width` | Floor width | `72 in` or `183 cm` (bare number: in) |
| `floor_length` | Floor length | `72 in` or `183 cm` (bare number: in) |
| `peak_height` | Peak height | `72 in` or `183 cm` (bare number: in) |
| `packed_size` | Packed size | sizes, e.g. `18 x 5 x 5 in` (bare: in) |

**Quilt** (category "Quilt", "Top Quilt", "Backpacking Quilt", "Underquilt", any spelling or plural)

| Column | Field | Value |
|---|---|---|
| `temp_comfort` | Comfort rating | `20F` or `-7C` (bare number: °F) |
| `temp_limit` | Limit rating | `20F` or `-7C` (bare number: °F) |
| `insulation` | Insulation | Down / Synthetic |
| `fill_power` | Fill power | 450 fill / 550 fill / 650 fill / 750 fill / 800 fill / 850 fill / 900 fill / 950 fill / 1000 fill |
| `rds` | RDS certified | Yes / No / Unknown |
| `footbox` | Footbox | Sewn / Zippered / Drawcord |
| `draft_collar` | Draft collar | yes / no |
| `quilt_shape` | Shape | Tapered / Rectangular / Other |

**Sleeping pad** (category "Sleeping Pad", "Sleep Pad", any spelling or plural)

| Column | Field | Value |
|---|---|---|
| `r_value` | R-value | number |
| `pad_type` | Type | Closed-cell foam / Inflatable / Self-inflating |
| `thickness` | Thickness | `72 in` or `183 cm` (bare number: in) |
| `pad_width` | Width | `72 in` or `183 cm` (bare number: in) |
| `pad_length` | Length | `72 in` or `183 cm` (bare number: in) |
| `packed_size` | Packed size | sizes, e.g. `18 x 5 x 5 in` (bare: in) |

**Sleeping bag** (category "Sleeping Bag", any spelling or plural)

| Column | Field | Value |
|---|---|---|
| `temp_comfort` | Comfort rating | `20F` or `-7C` (bare number: °F) |
| `temp_limit` | Limit rating | `20F` or `-7C` (bare number: °F) |
| `insulation` | Insulation | Down / Synthetic |
| `fill_power` | Fill power | 450 fill / 550 fill / 650 fill / 750 fill / 800 fill / 850 fill / 900 fill / 950 fill / 1000 fill |
| `rds` | RDS certified | Yes / No / Unknown |
| `gender` | Fit for | Men's / Women's / Unisex |
| `bag_width` | Width | Slim / Regular / Wide |
| `bag_shape` | Shape | Mummy / Tapered / Rectangular / Other |

**Outer layer** (category "Outer Layer", "Insulation", "Insulated Jacket", "Puffy", any spelling or plural)

| Column | Field | Value |
|---|---|---|
| `insulation` | Insulation | Down / Synthetic |
| `fill_power` | Fill power | 450 fill / 550 fill / 650 fill / 750 fill / 800 fill / 850 fill / 900 fill / 950 fill / 1000 fill |
| `fill_weight` | Fill weight | `14 oz` or `397 g` (bare number: oz) |
| `rds` | RDS certified | Yes / No / Unknown |
| `gender` | Fit for | Men's / Women's / Unisex |
| `hooded` | Hooded | yes / no |
| `zipper` | Zipper | Full / Quarter / None |
| `baffles` | Baffles | Sewn-through / Box / Other |

## Trails

The trail list starts with about 40 well-known long trails. **Owner → Trails**
edits them, adds more, and shows the names hikers typed that match nothing
yet: add one as a trail, merge it into an existing trail (it becomes a
nickname), or ignore it. Trail pages are at `/trails/<slug>` and in the
sitemap.

## AI assistants (MCP) and the API

Nothing to set up: `/mcp` and `/api/v1` run on every install. People connect
Claude or ChatGPT at `/developers` (the assistant signs them in through
`/oauth/authorize`) or make personal tokens there. The API is described in
API.md.

## Running somewhere else

The app is a standard Docker image that needs `DATABASE_URL`, a persistent
volume at `/app/public/userimages`, and the variables in
`.env.production.example`. Platforms like Render, Railway or Fly.io work: use
their managed Postgres, attach a persistent disk for uploads, and set
`TRUST_PROXY` to the number of proxies the platform puts in front (usually 1).
