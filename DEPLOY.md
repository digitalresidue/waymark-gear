# Deploying Waymark Gear to waymarkgear.com

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

The server needs outbound HTTPS to `lighterpack.com` for "Import from LighterPack" links (CSV uploads work without it). It only ever requests that site's public `/csv/:id` and `/r/:id` pages, never follows redirects, and is rate limited per IP (`rateLimit.importMaxPerWindow`, default 20 per 10 minutes). `LIGHTERPACK_URL` overrides the address if you ever need to.

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

```sh
ssh root@SERVER_IP
mkdir -p /opt/waymark && cd /opt/waymark
# copy these three files from the repo's deploy/ folder:
#   docker-compose.prod.yml, Caddyfile, .env.production.example
cp .env.production.example .env && chmod 600 .env
nano .env        # fill in APP_IMAGE, POSTGRES_PASSWORD, Google, Mailgun
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f app   # watch it start
```

Open `https://waymarkgear.com` — Caddy fetches the certificate on the first
request, which can take a few seconds.

## 7. Make yourself the owner and load the catalog

1. Register your account on the site (or sign in with Google).
2. Put your username in `.env`: `ADMINS=["yourusername"]`, then
   `docker compose -f docker-compose.prod.yml up -d` to apply it.
3. Sign in again. **Owner → Gear catalog → Download CSV template**, fill it in
   (one row per product; weight with a unit of `g`, `kg`, `oz` or `lb`), then
   **Import CSV**. Review what will be added or changed, and **Apply**.
4. Before launch, finish `PRIVACY.md` and `TERMS.md` (replace every
   `[bracketed]` item and remove the draft notes), and replace the remaining
   LighterPack artwork in `public/images/` (background images and the welcome
   screenshot). Commit and push — the next release picks them up.

## 8. Backups

```sh
cd /opt/waymark
curl -fsSLo backup.sh https://raw.githubusercontent.com/YOUR-USER/waymark-gear/main/deploy/backup.sh
chmod 700 backup.sh
apt-get install -y rclone && rclone config   # add a remote named "offsite"
./backup.sh                                   # run once to check
crontab -e   # add:  15 3 * * * /opt/waymark/backup.sh >> /var/log/waymark-backup.log 2>&1
```

Each night this saves a compressed database dump and the uploaded photos,
keeps 14 days on the server, and copies them off-site. **Test a restore**
once (instructions at the top of `backup.sh`) — a backup you haven't
restored is a guess.

## 9. Shipping updates

1. Push to `main`. CI runs; on success a new image is published.
2. On the server:
   ```sh
   cd /opt/waymark
   docker compose -f docker-compose.prod.yml pull app
   docker compose -f docker-compose.prod.yml up -d app
   ```
   Database migrations run automatically on start. The app shuts down
   gracefully, so in-flight saves finish first.
3. Roll back by setting `APP_IMAGE` to a previous commit's tag
   (`ghcr.io/your-user/waymark-gear:<sha>`) and running `up -d` again.

Dependabot opens weekly pull requests for dependency updates; merging them
after CI passes keeps security patches current.

## Security checklist

- [ ] `NODE_ENV=production` (set in the compose file): secure cookies, HSTS.
- [ ] `TRUST_PROXY=1` behind Caddy (set in the compose file). Use `2` if you
      also proxy through Cloudflare.
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

To go further, proxy through Cloudflare (orange cloud). Set SSL mode to
**Full (strict)**, set `TRUST_PROXY: 2` in the compose file, and keep the
origin firewall as above. Cloudflare doesn't cache HTML by default, so add a
**Cache Rule**:

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
for REI and many outdoor brands, a brand's own program). Then either:

- **Owner → Revenue → Affiliate rules**: one rule per shop, e.g. domain
  `amazon.com`, parameter `tag`, value `yourtag-20`. Every catalog product link
  on that shop gets your code; or
- set an item's own **Affiliate link** in the catalog editor (or the
  `affiliate_url` CSV column) for programs that use a tracking URL instead of a
  parameter. An item's own link wins over the rules.

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
5. `docker compose -f docker-compose.prod.yml up -d`. The Subscribe buttons
   appear at `/supporter`. Try it first with test-mode keys and Stripe's test
   card 4242 4242 4242 4242.

To give someone Supporter for free (a contributor, a reviewer): Owner →
Revenue → Supporters.

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
