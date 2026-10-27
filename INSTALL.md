# Install Waymark Gear on DigitalOcean

This guide puts your own copy of Waymark Gear on the internet, at your own
web address, with a padlock (HTTPS), nightly backups and security updates. You
don't need to know anything about servers. Every click and every command is
written out, and you can copy and paste every command.

> **Checked with Waymark Gear 0.1.0.** DigitalOcean's screens last checked
> 2026-10-27. If a screen looks different, look for the same words nearby.
> Things move around, but the choices stay the same. [Tell us](#getting-help)
> and we'll fix the guide.

**Time:** about 30 minutes, plus waiting for your domain to update (usually
minutes, occasionally a couple of hours).

**What it costs** (October 2026 prices; check DigitalOcean for today's):

| What | Cost | Needed? |
| --- | --- | --- |
| A DigitalOcean server ("droplet"), 2 GB | $12 a month | Yes |
| A domain name, e.g. `yourname.com` | About $10–20 a year from any domain company | Yes |
| DigitalOcean weekly backups of the whole server | $2.40 a month (20% of the droplet) | Recommended |
| Email for password resets (Mailgun) | Free for up to 100 emails a day | Recommended |
| Copying backups to DigitalOcean Spaces | $5 a month | Optional |

**You need:**

- A computer with a web browser. Everything happens in the browser; nothing
  gets installed on your computer.
- A credit card or PayPal for DigitalOcean.
- A domain name you've bought, and the login for the company you bought it
  from (Namecheap, GoDaddy, Cloudflare, Porkbun, Squarespace...). If you don't
  have one yet, buy one first. Any company is fine.
- A password manager, or a safe place to write down two passwords.

<details>
<summary><b>Words used in this guide</b> (click to open)</summary>

- **Droplet**: DigitalOcean's name for a server, a computer in their
  building that runs your site day and night.
- **IP address**: the droplet's number on the internet, like `164.92.10.25`.
- **Domain**: your site's name, like `waymarkgear.com`.
- **DNS** and **A record**: the internet's address book. An A record says
  "this domain lives at this IP address."
- **Console**: a window in your browser where you type commands into the
  droplet. It looks like a black box with text.
- **Docker**: the tool that runs Waymark and its database on the droplet.
  The setup script installs and runs it; you never need to touch it.
- **HTTPS certificate**: what gives your site the padlock. It's set up and
  renewed automatically.

</details>

---

## Step 1. Make a DigitalOcean account

1. Go to **digitalocean.com** and click **Sign up**.
2. Sign up with your email (or Google or GitHub), then confirm your email.
3. Add a payment method when asked.
4. If it asks what you're building, pick anything. It only shapes the
   suggestions it shows you.

## Step 2. Create the droplet

1. In DigitalOcean, click the green **Create** button at the top, then
   **Droplets**.
2. **Choose Region**: pick the city closest to most of your visitors (for
   example **New York** or **San Francisco** for the US, **Amsterdam** or
   **London** for Europe). Leave the datacenter number as it is.
3. **Choose an Image**: on the **OS** tab click **Ubuntu**, then pick
   **24.04 (LTS) x64** from its version list.
   (Don't use the "Docker" app from the other tabs. The setup script brings
   its own, newer Docker.)
4. If you see **Choose configuration type**, pick **Bundled**.
5. **Choose a Droplet Plan**: **SHARED CPU** → **Basic** → **Regular**, then
   the **$12/mo** option: *2 GB memory, 1 CPU, 50 GB disk*.
   (The $6 one has 1 GB of memory and is too small. You can grow the droplet
   later with a few clicks if your site gets busy.)
6. **Enable Backups** (recommended): tick **Enable automated backups** and
   choose **Weekly**. This saves a copy of the whole droplet each week, on top
   of the nightly backups the setup script schedules.
7. **Choose Authentication Method**: choose **Password**, and make a long
   one (at least 16 characters). Save it in your password manager. You'll
   rarely need it, because the Console signs you in by itself. But it's your
   way in if anything goes wrong.
   *(If you already use SSH keys, choose **SSH key** instead. Everything else
   is the same.)*
8. **Networking**: leave **Public IPv4 address** ticked. Leave
   **IPv6** unticked.
9. Tick **Improved Metrics and monitoring** (free), so DigitalOcean can show
   you graphs and alert you if the droplet struggles.
10. **Finalize Details**: change **Hostname** to `waymark`.
11. Click **Create Droplet** at the bottom.

After about a minute the droplet appears in your list with a number next to
it, like `164.92.10.25`. **That's your IP address. Copy it** (click it, or
select it and copy) and keep it handy for step 4.

## Step 3. Open the Console

1. Click your droplet's name (**waymark**) to open its page.
2. Click **Console** (it may say **Web Console** or **Launch Droplet Console**)
   near the top right. A new window opens with a black background, and after a
   few seconds it shows something like:

   ```text
   root@waymark:~#
   ```

   That's the droplet waiting for a command. You're signed in as **root**, the
   droplet's administrator.

**How to paste a command:** copy it from this guide (each grey box has a copy
button on GitHub), click inside the Console window, then **right-click →
Paste**, or press **Ctrl+Shift+V** (Windows/Linux) or **Cmd+V** (Mac). Press
**Enter** to run it. Paste one box at a time and wait for the
`root@waymark:~#` line to come back before the next.

Keep this window open. You'll come back to it in step 5.

## Step 4. Point your domain at the droplet

This tells the internet that your domain lives on your droplet. You do it on
the website of the company you bought your domain from.

1. Sign in there and find your domain's **DNS** settings. They're usually
   called **DNS**, **DNS records**, **Advanced DNS** or **Manage DNS**. There
   are notes for common companies below.
2. **Delete the old records first.** Look for any record of type **A**,
   **AAAA** or **CNAME** whose name is `@`, blank, your domain itself, or
   `www`, and delete them. They usually point to a "parked" page. If you leave
   one behind, visitors may land on the wrong page and the padlock won't work.
   *Don't touch records of type MX or TXT: those are for email.*
3. Add two new records:

   | Type | Name (or Host) | Value (or Points to) | TTL |
   | --- | --- | --- | --- |
   | **A** | `@` | your droplet's IP, e.g. `164.92.10.25` | Automatic (or 5 min) |
   | **A** | `www` | the same IP | Automatic (or 5 min) |

   `@` means "the domain itself". Some companies want it left blank or want
   the full domain typed instead. Their form will say.
4. Save.

<details>
<summary><b>Where DNS lives at common domain companies</b></summary>

Menu names change now and then; look for the same words.

- **Namecheap**: Domain List → **Manage** next to the domain → **Advanced
  DNS** tab → **Add New Record**. Delete the "URL Redirect Record" and
  "CNAME www → parkingpage" records it starts with.
- **GoDaddy**: My Products → your domain → **DNS** → **DNS Records** → **Add
  New Record**. Delete the A record "Parked" and any **Forwarding** set up
  further down the page.
- **Cloudflare**: your domain → **DNS** → **Records** → **Add record**.
  **Click the orange cloud so it turns grey ("DNS only")** on both records.
  Leave it grey while you install; [DEPLOY.md](DEPLOY.md#traffic-spikes-and-cloudflare)
  explains how to turn it orange safely later.
- **Porkbun**: Domain Management → **DNS** next to the domain. Delete the
  ALIAS and CNAME records pointing at `pixie.porkbun.com`.
- **Squarespace Domains** (formerly Google Domains): Domains → your domain →
  **DNS** → **DNS settings** → **Custom records**. Remove Squarespace's
  default records if the domain was connected to a Squarespace site.

</details>

You don't have to wait for this to finish before step 5: the setup script
checks your domain and waits for it if needed.

## Step 5. Run the setup

Go back to the Console window from step 3. Paste these **three** boxes one at
a time, pressing **Enter** after each.

**5a. Install Docker** (about a minute; lots of text scrolls past, which is
normal):

```sh
curl -fsSL https://get.docker.com | sh
```

**5b. Download the setup script** (from the Waymark release itself, so it
always matches the version you're installing):

```sh
docker run --rm ghcr.io/digitalresidue/waymark-gear:latest cat deploy/install.sh > install.sh
```

If this says **denied** or **unauthorized**, see
[If something goes wrong](#if-something-goes-wrong).

**5c. Run it:**

```sh
bash install.sh
```

It asks four questions. Type each answer and press **Enter**:

1. **Your domain**, like `waymarkgear.com`. Leave out `https://` and `www`.
2. **A username** for your account. You'll be the site's **owner**, which
   lets you run the gear catalog, trails and featured kits.
3. **Your email address.**
4. **A password** for that account, typed twice. **Nothing appears as you
   type.** That's normal, and it's to keep it private. Just type it and press
   Enter.

Then it works on its own for about five minutes, ticking off each part:

- turns on the firewall and automatic security updates
- downloads Waymark and saves your settings
- checks your domain points at the droplet, and waits if it doesn't yet
- starts the site and creates your owner account
- gets the padlock certificate
- schedules a backup every night

When it finishes you'll see **All done!** and your site's address.

**If the Console window closes or you lose your connection** partway
through, open the Console again and run `bash install.sh` again. It carries on
where it stopped.

## Step 6. Visit your site

Open `https://yourdomain.com` in your browser and sign in with the username
and password from step 5. You'll see **Owner** in the menu: that's where you
run the site.

**That's it, your site is live.** The next section adds a few important
extras.

---

## After installing

Settings live in one file on the droplet. To change them, open the Console and
run:

```sh
waymark settings
```

This opens the settings in a simple editor called **nano**:

- Use the **arrow keys** to move around (the mouse doesn't work here).
- Type to add text, and use **Backspace** to delete.
- Paste with **right-click → Paste** or **Ctrl+Shift+V** / **Cmd+V**.
- When you're done, press **Ctrl+O** then **Enter** to save, then **Ctrl+X**
  to close.

Waymark restarts with your new settings by itself.

### Recommended: email

Without email, **"Forgot password" can't send anything**, for you or for
your members. Waymark sends email through **Mailgun** (free up to 100 emails a
day).

1. Sign up at **mailgun.com** and choose the **Free** plan.
2. In Mailgun, open **Domains** (under **Sending**) and click **Add new
   domain**. Enter `mg.yourdomain.com` (a "mail subdomain" keeps your normal
   email untouched).
3. Mailgun shows a list of DNS records (TXT and CNAME, sometimes MX). Add each
   one at your domain company, the same place as step 4, copying the **Name**
   and **Value** exactly. Back in Mailgun, click **Verify**. It can take a
   little while to show green.
4. In Mailgun, find **API keys** (in the domain's settings, or your account
   menu) and create a **sending API key** for that domain. Copy it: it's
   shown only once.
5. In the Console, run `waymark settings` and fill in these lines (the rest
   stay as they are):

   ```sh
   MAILGUN_DOMAIN=mg.yourdomain.com
   MAILGUN_API_KEY=paste-the-key-here
   MAIL_FROM="Your Site Name <noreply@mg.yourdomain.com>"
   MAIL_REPLY_TO="Your Site Name <you@yourdomain.com>"
   ```

   Save and close (**Ctrl+O**, **Enter**, **Ctrl+X**).
6. Test it: sign out, click **Forgot password**, and enter your username. The
   email should arrive within a minute (check spam the first time).

*Mailgun won't send from the domain until it shows as verified, so finish
part 3 before testing.*

### Optional: Continue with Google

Lets people sign in with their Google account. It's free; the full
walkthrough, with the exact Google Cloud screens, is in
[DEPLOY.md, step 4](DEPLOY.md#4-set-up-google-sign-in). The two values it gives
you go into `waymark settings`:

```sh
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### Optional: payments and affiliate links

The $5/month Supporter plan (through Stripe) and affiliate links on the gear
catalog are set up in [DEPLOY.md](DEPLOY.md#supporter-plan-and-affiliate-links).
Both are off until you add their settings.

### Recommended: know if the site goes down

Sign up for a free uptime monitor such as **UptimeRobot** and add a monitor
for `https://yourdomain.com/healthz`. It emails you if the site stops
answering.

### Recommended: give yourself a second owner

Owners are listed in `waymark settings` on the `ADMINS=` line. To add
someone, once they've signed up, change it to, for example:
`ADMINS=["you","partner"]`.

### Optional: helpers

Also in `waymark settings`, each a list of usernames in the same
`["name","name"]` form:

- `MODERATORS=` can hide reported lists and comments (Owner → Moderation),
  without being able to change the catalog.
- `REVIEWERS=` can write gear reviews on catalog items. Set
  `OPEN_REVIEWS=true` instead to let every member review.

---

## Everyday use

Open the Console (step 3) and type any of these:

| Command | What it does |
| --- | --- |
| `waymark status` | Checks everything is running and the site is reachable. Start here if anything seems wrong. |
| `waymark update` | Gets the newest version of Waymark. Backs up first, and goes back to the previous version by itself if the new one won't start. |
| `waymark settings` | Changes settings (email, Google, payments, owners), then applies them. |
| `waymark logs` | Shows what the site is doing, live. Press **Ctrl+C** to stop watching. |
| `waymark restart` | Restarts everything. Safe to do any time. |
| `waymark backup` | Backs up now. (Also happens every night at 03:15.) |
| `waymark backups` | Lists the backups on the droplet. |
| `waymark offsite` | Sets up copying backups somewhere other than the droplet. |
| `waymark restore 2026-10-27` | Puts the whole site back to that day's backup. |
| `waymark reset-password yourname` | Sets a new password for an account (yours too). |
| `waymark version` | Shows which version is running. |
| `waymark help` | Lists these commands. |

**Updating:** run `waymark update` every few weeks, or whenever there's a new
release. Your data and settings are kept. Security updates for the droplet
itself install automatically every day.

## Backups

Three layers keep your members' lists safe:

1. **Every night** at 03:15 (server time), the database and uploaded photos are
   saved in `/opt/waymark/backups` on the droplet and kept for 14 days.
2. **Weekly droplet backups** from DigitalOcean (if you ticked the box in step
   2) copy the whole droplet. To use one: droplet page → **Backups** →
   **Restore Droplet**.
3. **Off-site copies** (recommended once the site has real members): the
   nightly backups also go to storage outside the droplet, so they survive
   even if the droplet is deleted.

To set up off-site copies with **DigitalOcean Spaces** ($5 a month, 250 GB):

1. In DigitalOcean: **Create → Spaces Object Storage**, pick the same region
   as your droplet, and name the bucket `waymark-backups-yourname`.
2. Make a key for it: in Spaces Object Storage open **Access Keys** (on
   older screens: **API → Spaces Keys**) and create one with access to that
   bucket. Copy the **Access Key** and **Secret Key** (the secret is shown
   only once).
3. In the Console run `waymark offsite` and answer:
   - `n` for a new remote, name: **`offsite`**
   - Storage type: type `s3` (Amazon S3 compliant)
   - Provider: **DigitalOcean**
   - `env_auth`: press Enter (false)
   - Access key and secret key: paste them
   - Endpoint: the one for your region, e.g. `nyc3.digitaloceanspaces.com`
   - Press **Enter** to accept the default for everything else, then `y` to
     confirm and `q` to quit.

   It runs a backup straight away to check it works. (Backblaze B2 works the
   same way: choose `b2` as the storage type.)

**Restoring:** `waymark backups` lists the backups you have, and
`waymark restore 2026-10-27` (with a name from that list) puts the site back
to it. It saves a copy of the site as it is first (listed as
`...-before-restore-...`), so you can undo a restore by restoring that
copy.

## If something goes wrong

Start with `waymark status`: it says what isn't working. Then find the
message below.

**`denied` or `unauthorized` when downloading (step 5b).**
The Waymark image isn't public. If you run your own copy of the code, either
make its package public (GitHub → your profile → **Packages** → waymark-gear →
**Package settings** → **Change visibility** → Public), or sign in: make a
token at **github.com/settings/tokens** (*Generate new token (classic)*, tick
only **read:packages**), then run
`docker login ghcr.io -u YOUR-GITHUB-USERNAME` and paste the token as the
password. The setup script also offers to do this sign-in for you.

**"yourdomain.com doesn't point here yet."**
Step 4 isn't finished, or hasn't spread across the internet yet. Check the A
records are saved with exactly your droplet's IP, and that you deleted the old
A/AAAA/CNAME records. Free checker: **dnschecker.org**: enter your domain,
choose **A**, and you should see your droplet's IP. The script keeps waiting
and checking; you can also press **Ctrl+C** and run `bash install.sh` again
later.

**The site shows a padlock warning, "not secure", or a page from your domain
company.**
Almost always an old DNS record is still there (step 4, part 2), or Cloudflare's
cloud is orange instead of grey. Fix it, wait a few minutes, then run
`waymark restart`.

**`waymark status` says the app isn't answering.**
Run `waymark logs` and look at the last lines. If you just changed settings,
a typo there is the usual cause: run `waymark settings` and check the line you
changed (keep quotes in pairs, and no spaces around `=`).

**Nothing happens when you type a password.**
That's normal: passwords don't show as you type. Type it and press Enter.

**The Console won't open, or says it can't connect.**
On the droplet's page, try **Access → Launch Recovery Console** and sign in as
`root` with the droplet password from step 2. Then run `ufw allow OpenSSH` and
try the normal Console again.

**You forgot your Waymark password and email isn't set up.**
In the Console: `waymark reset-password yourusername`.

**`waymark update` said it went back to the previous version.**
Your site is fine and on the version it had before. Copy the messages it
printed and [report them](#getting-help).

**You forgot the droplet's root password.**
Droplet page → **Access** → **Reset Root Password**. DigitalOcean emails you
a new one.

## Starting over

Easiest: destroy the droplet (droplet page → **Destroy**) and start again at
step 2. **This deletes everything on it, including members' data.** Download a
backup first if you need it.

To reinstall on the same droplet while keeping nothing, run these three lines
in the Console (also deletes all data):

```sh
cd /opt/waymark && docker compose -f docker-compose.prod.yml down -v
rm -rf /opt/waymark /etc/cron.d/waymark /usr/local/bin/waymark
cd ~ && bash install.sh
```

## Getting help

Open an issue at **github.com/digitalresidue/waymark-gear/issues**. Say which
step you're on, and paste what `waymark status` prints, plus any red
"Stopped:" message. Please don't paste the contents of your settings file: it
holds passwords.

## For maintainers: keeping this guide right

This guide is part of the code. It's checked, not just written:

- **Every pull request** runs `test/install/run.sh` in CI ("Docker image
  builds" job). It builds the image, bootstraps it exactly as step 5 says,
  then checks HTTPS, the owner account, resuming an interrupted install, and
  every `waymark` command, including update, backup and restore.
- **A unit test** (`test/unit/install-guide.test.js`) fails if this guide and
  the code drift apart. It checks that every setting in
  `deploy/.env.production.example` and every `waymark` command is explained
  here, that sections the scripts point to still exist, and that the
  "Checked with" version at the top matches `package.json`.
- **Every three months** a scheduled workflow opens an issue to re-walk
  DigitalOcean's screens, since they change without telling us. Update the
  "screens last checked" date when you do.
- **Each release**: follow the checklist in [CONTRIBUTING.md](CONTRIBUTING.md#releasing).

Advanced setups (other hosts, Cloudflare, a managed database, scaling) are in
[DEPLOY.md](DEPLOY.md).
