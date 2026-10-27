#!/usr/bin/env bash
# Waymark Gear: set up a fresh Ubuntu server in one go.
#
# INSTALL.md walks through this step by step. In short, on the server:
#
#   curl -fsSL https://get.docker.com | sh
#   docker run --rm ghcr.io/digitalresidue/waymark-gear:latest cat deploy/install.sh > install.sh
#   bash install.sh
#
# It asks four questions (your domain, and the username, email and password
# for your owner account), then on its own:
#   - turns on the firewall, automatic security updates and a swap file
#   - downloads Waymark and puts its files in /opt/waymark
#   - writes /opt/waymark/.env with a random database password
#   - checks your domain points at this server
#   - starts the site, gets the HTTPS certificate and creates your account
#   - schedules a backup every night
#   - installs the `waymark` command (waymark help)
#
# Safe to run again: a finished install is left alone, and one that was
# interrupted (the Console closed, DNS wasn't ready) carries on where it
# stopped, keeping its database password.
#
# Non-interactive use (CI) — every question can be answered ahead:
#   WAYMARK_YES=1 WAYMARK_DOMAIN=example.com WAYMARK_OWNER=me \
#   WAYMARK_EMAIL=me@example.com WAYMARK_PASSWORD=... bash install.sh
# Also: WAYMARK_IMAGE (which image), WAYMARK_DIR (default /opt/waymark),
# WAYMARK_SKIP_SYSTEM=1 (no firewall/updates/swap/cron),
# WAYMARK_SKIP_DNS=1 (don't wait for DNS), WAYMARK_NO_PULL=1 (use a local image).

set -euo pipefail

IMAGE="${WAYMARK_IMAGE:-ghcr.io/digitalresidue/waymark-gear:latest}"
DIR="${WAYMARK_DIR:-/opt/waymark}"
BIN="${WAYMARK_BIN:-/usr/local/bin/waymark}"
COMPOSE=(docker compose --project-directory "$DIR" -f "$DIR/docker-compose.prod.yml")

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
note() { printf '  %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
stop() {
    printf '\n\033[31mStopped:\033[0m %s\n' "$1" >&2
    shift
    for line in "$@"; do printf '  %s\n' "$line" >&2; done
    printf '\nNothing is broken: fix that and run  bash install.sh  again.\n' >&2
    exit 1
}

# ---------------------------------------------------------------- checks

[ "$(id -u)" -eq 0 ] || stop "this needs to run as root." \
    "On a DigitalOcean droplet you are root already when you use the Console." \
    "Otherwise run:  sudo bash install.sh"

command -v docker >/dev/null || stop "Docker isn't installed yet." \
    "Run this first, then run install.sh again:" \
    "  curl -fsSL https://get.docker.com | sh"

docker compose version >/dev/null 2>&1 || stop "Docker Compose is missing." \
    "Reinstall Docker with:  curl -fsSL https://get.docker.com | sh"

if [ -f "$DIR/.installed" ] && [ -z "${WAYMARK_REINSTALL:-}" ]; then
    bold "Waymark is already installed in $DIR."
    note "To get the newest version:   waymark update"
    note "To see if it's running:      waymark status"
    note "To change settings:          waymark settings"
    note "(To start again from scratch, see INSTALL.md, \"Starting over\".)"
    exit 0
fi

if [ -r /etc/os-release ]; then
    . /etc/os-release
    [ "${ID:-}" = "ubuntu" ] || warn "This was written for Ubuntu; you have ${PRETTY_NAME:-something else}. Carrying on."
fi

# ------------------------------------------------------------- questions

ask() { # ask VAR "Question" [default]
    local var=$1 question=$2 default=${3:-} answer
    if [ -n "${!var:-}" ]; then return; fi
    [ -z "${WAYMARK_YES:-}" ] || stop "$var isn't set (needed with WAYMARK_YES=1)."
    while true; do
        if [ -n "$default" ]; then read -r -p "  $question [$default]: " answer || true; else read -r -p "  $question: " answer || true; fi
        answer=${answer:-$default}
        if [ -n "$answer" ]; then printf -v "$var" '%s' "$answer"; return; fi
    done
}

bold "Waymark Gear setup"
note "Four questions, then it does the rest (about 5 minutes)."

DOMAIN=${WAYMARK_DOMAIN:-}
while true; do
    ask DOMAIN "1. Your domain, like  waymarkgear.com  (no https://, no www)"
    # Forgive the usual slips: https://, www., a trailing slash, capitals.
    DOMAIN=$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z' | sed -E 's#^[a-z]+://##; s#^www\.##; s#/.*$##; s/[[:space:]]//g')
    if [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$ ]]; then break; fi
    [ -z "${WAYMARK_YES:-}" ] || stop "\"$DOMAIN\" doesn't look like a domain."
    warn "\"$DOMAIN\" doesn't look like a domain. Try again, e.g. waymarkgear.com"
    DOMAIN=
done
ok "Domain: $DOMAIN"

OWNER=${WAYMARK_OWNER:-}
while true; do
    ask OWNER "2. A username for your owner account (3-32 letters, digits, - or _)"
    OWNER=$(printf '%s' "$OWNER" | tr 'A-Z' 'a-z' | tr -d '[:space:]')
    if [[ "$OWNER" =~ ^[a-z0-9_-]{3,32}$ ]]; then break; fi
    [ -z "${WAYMARK_YES:-}" ] || stop "\"$OWNER\" isn't a valid username."
    warn "Use 3 to 32 letters, digits, - or _."
    OWNER=
done
ok "Owner: $OWNER"

EMAIL=${WAYMARK_EMAIL:-}
while true; do
    ask EMAIL "3. Your email address (for password resets)"
    if [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then break; fi
    [ -z "${WAYMARK_YES:-}" ] || stop "\"$EMAIL\" isn't a valid email address."
    warn "That doesn't look like an email address."
    EMAIL=
done
ok "Email: $EMAIL"

PASSWORD=${WAYMARK_PASSWORD:-}
while [ -z "$PASSWORD" ]; do
    [ -z "${WAYMARK_YES:-}" ] || stop "WAYMARK_PASSWORD isn't set (needed with WAYMARK_YES=1)."
    read -r -s -p "  4. A password for that account (8 or more characters; nothing shows as you type): " p1 || true
    printf '\n'
    if [ "${#p1}" -lt 8 ] || [ "${#p1}" -gt 60 ]; then warn "Use 8 to 60 characters."; continue; fi
    read -r -s -p "     Type it again: " p2 || true
    printf '\n'
    if [ "$p1" != "$p2" ]; then warn "Those didn't match. Once more."; continue; fi
    PASSWORD=$p1
done
ok "Password set"

# --------------------------------------------------------- system set-up

if [ -z "${WAYMARK_SKIP_SYSTEM:-}" ]; then
    bold "Securing the server"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq >/dev/null
    apt-get install -y -qq ufw unattended-upgrades cron >/dev/null

    # Firewall: SSH (the DigitalOcean Console uses it), web, and HTTP/3.
    ufw allow OpenSSH >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw allow 443/udp >/dev/null
    ufw --force enable >/dev/null
    ok "Firewall on: only SSH and the website are open"

    printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
    ok "Security updates install themselves every day"

    # A small server can run short of memory while updating; swap is the
    # safety net.
    if ! swapon --show | grep -q .; then
        if fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
            chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
            grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
            ok "2 GB swap file added"
        fi
    fi
fi

# ------------------------------------------------------------- download

bold "Downloading Waymark"
pull() {
    if [ -n "${WAYMARK_NO_PULL:-}" ]; then docker image inspect "$IMAGE" >/dev/null 2>&1; return; fi
    docker pull -q "$IMAGE" >/dev/null 2>&1
}
if ! pull; then
    if [ -n "${WAYMARK_YES:-}" ]; then stop "couldn't download $IMAGE."; fi
    warn "Couldn't download $IMAGE."
    note "If this copy of Waymark is private, sign in to GitHub's registry:"
    note "make a token at github.com/settings/tokens (classic, tick only read:packages)."
    read -r -p "  GitHub username (or press Enter to stop): " ghuser || true
    [ -n "$ghuser" ] || stop "couldn't download $IMAGE." \
        "Check the internet connection, or see INSTALL.md, \"If something goes wrong\"."
    read -r -s -p "  Token (nothing shows as you paste): " ghtoken || true
    printf '\n'
    printf '%s' "$ghtoken" | docker login ghcr.io -u "$ghuser" --password-stdin >/dev/null \
        || stop "GitHub didn't accept that username and token."
    pull || stop "signed in, but still couldn't download $IMAGE." \
        "Check the token can read packages and the name is right."
fi
ok "Got $IMAGE"

mkdir -p "$DIR"
chmod 755 "$DIR"
CID=$(docker create "$IMAGE")
trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
for f in docker-compose.prod.yml Caddyfile backup.sh .env.production.example; do
    docker cp "$CID:/app/deploy/$f" "$DIR/$f"
done
docker cp "$CID:/app/deploy/waymark" "$BIN"
chmod 700 "$DIR/backup.sh"
chmod 755 "$BIN"
ok "Files in $DIR; the waymark command is installed"

# ---------------------------------------------------------------- .env

# set_env KEY VALUE: replace KEY=... in .env, or add it.
set_env() {
    local tmp
    tmp=$(mktemp)
    KEY=$1 VAL=$2 awk 'BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"]; done = 0 }
        index($0, k "=") == 1 { print k "=" v; done = 1; next } { print }
        END { if (!done) print k "=" v }' "$DIR/.env" > "$tmp"
    cat "$tmp" > "$DIR/.env"
    rm -f "$tmp"
}

umask 077
# An interrupted earlier run already made the database with its password:
# keep it, or the app could never get in.
DB_PASSWORD=
if [ -f "$DIR/.env" ]; then DB_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$DIR/.env" | tail -1 | cut -d= -f2-); fi
[ -n "$DB_PASSWORD" ] || DB_PASSWORD=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
[ -f "$DIR/.env" ] || cp "$DIR/.env.production.example" "$DIR/.env"
chmod 600 "$DIR/.env"
set_env SITE_DOMAIN "$DOMAIN"
set_env APP_IMAGE "$IMAGE"
set_env POSTGRES_PASSWORD "$DB_PASSWORD"
set_env ADMINS "[\"$OWNER\"]"
umask 022
ok "Settings saved in $DIR/.env (private to root)"

# ------------------------------------------------------------------ DNS

public_ip() {
    curl -fsS -m 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null \
        || curl -fsS -4 -m 5 https://api.ipify.org 2>/dev/null || true
}
points_here() { # domain ip
    getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u | grep -qx "$2"
}

if [ -z "${WAYMARK_SKIP_DNS:-}" ]; then
    bold "Checking your domain points here"
    IP=$(public_ip)
    if [ -z "$IP" ]; then
        warn "Couldn't work out this server's address; skipping the check."
    else
        note "This server's address is $IP"
        waited=0
        until points_here "$DOMAIN" "$IP"; do
            if [ "$waited" -eq 0 ]; then
                warn "$DOMAIN doesn't point here yet."
                note "At your domain company, add an A record for $DOMAIN -> $IP"
                note "and one for www -> $IP (INSTALL.md, step 4)."
                note "Changes can take a few minutes, occasionally an hour or two."
                note "Waiting and checking every 30 seconds (Ctrl+C to stop; run install.sh again later)..."
            fi
            [ -z "${WAYMARK_YES:-}" ] || stop "$DOMAIN doesn't point at $IP."
            sleep 30
            waited=$((waited + 30))
            if [ $((waited % 300)) -eq 0 ]; then note "Still waiting ($((waited / 60)) minutes)..."; fi
        done
        ok "$DOMAIN points at this server"
        if ! points_here "www.$DOMAIN" "$IP"; then
            warn "www.$DOMAIN doesn't point here yet. The site works without it;"
            note "add the www record when you can and it will start redirecting."
        fi
    fi
fi

# ---------------------------------------------------------------- start

bold "Starting the site (the first start takes a minute or two)"
"${COMPOSE[@]}" up -d --quiet-pull >/dev/null 2>&1 || "${COMPOSE[@]}" up -d
healthy() { "${COMPOSE[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; }
for i in $(seq 1 90); do
    if healthy; then break; fi
    if [ "$i" -eq 90 ]; then
        "${COMPOSE[@]}" logs --tail 40 app >&2 || true
        stop "the site didn't start. The lines above are its last messages." \
            "Run  waymark logs  to watch it, or see INSTALL.md, \"If something goes wrong\"."
    fi
    sleep 2
done
ok "Waymark is running"

# Create the owner account directly, so nobody else can claim the name.
REGISTER_JS='fetch("http://127.0.0.1:3000/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:process.env.U,email:process.env.E,password:process.env.P})}).then(async r=>{const t=await r.text();if(r.ok){console.log("created");return}if(/taken|in use|already/i.test(t)){console.log("exists");return}console.error(t);process.exit(1)}).catch(e=>{console.error(e.message);process.exit(1)})'
result=$("${COMPOSE[@]}" exec -T -e U="$OWNER" -e E="$EMAIL" -e P="$PASSWORD" app node -e "$REGISTER_JS" 2>&1) \
    || stop "couldn't create the account $OWNER: $result" "You can sign up on the site instead; you're already set as owner."
if [ "$result" = "exists" ]; then ok "Account $OWNER already exists (it's the owner)"; else ok "Owner account $OWNER created"; fi
unset PASSWORD

# HTTPS: Caddy fetches the certificate on the first visit.
bold "Getting the HTTPS certificate"
if [ "$DOMAIN" = "localhost" ]; then
    curl -fsSk -m 30 "https://localhost/healthz" >/dev/null && ok "https://localhost works (test certificate)"
else
    got=
    for i in $(seq 1 20); do
        if curl -fsS -m 15 "https://$DOMAIN/healthz" >/dev/null 2>&1; then got=1; break; fi
        sleep 6
    done
    if [ -n "$got" ]; then
        ok "https://$DOMAIN works"
    else
        warn "The certificate isn't ready yet. That's usually DNS still settling;"
        note "Caddy keeps trying by itself. Check again in a few minutes with  waymark status"
    fi
fi

# --------------------------------------------------------------- backups

if [ -z "${WAYMARK_SKIP_SYSTEM:-}" ]; then
    printf '# Waymark Gear: nightly backup (see INSTALL.md, "Backups").\nSHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n15 3 * * * root WAYMARK_DIR=%s %s/backup.sh >> /var/log/waymark-backup.log 2>&1\n' "$DIR" "$DIR" > /etc/cron.d/waymark
    chmod 644 /etc/cron.d/waymark
    ok "Backups every night at 03:15 server time, kept 14 days (waymark offsite copies them elsewhere)"
fi

# ----------------------------------------------------------------- done

date -Is > "$DIR/.installed"

bold "All done!"
note "Your site:        https://$DOMAIN"
note "Sign in as:       $OWNER  (you're the owner: look for Owner in the menu)"
note ""
note "Handy commands (type them here, any time):"
note "  waymark status     is everything running?"
note "  waymark update     get the newest version"
note "  waymark settings   add email, Google sign-in, payments..."
note "  waymark help       everything else"
note ""
note "Next: INSTALL.md, \"After installing\" (email for password resets is the important one)."
