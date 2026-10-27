#!/usr/bin/env bash
# Runs INSTALL.md's server steps for real, against a built image, and
# checks the result. CI runs it on every pull request ("Install guide" job),
# so the guide's commands can't quietly stop working.
#
#   docker build -t waymark-gear:test .
#   sudo bash test/install/run.sh waymark-gear:test
#
# Uses the domain "localhost" (Caddy gives it a test certificate), skips the
# firewall/swap/cron set-up and the DNS wait, and cleans up afterwards.

set -euo pipefail

IMAGE=${1:?usage: run.sh <image>}
WORK=$(mktemp -d)
export WAYMARK_DIR="$WORK/waymark"
export WAYMARK_BIN="$WORK/bin/waymark"
export WAYMARK_YES=1 WAYMARK_SKIP_SYSTEM=1 WAYMARK_SKIP_DNS=1 WAYMARK_NO_PULL=1
export WAYMARK_IMAGE="$IMAGE" WAYMARK_DOMAIN=localhost WAYMARK_OWNER=trailboss
export WAYMARK_EMAIL=owner@example.com WAYMARK_PASSWORD=first-password-1
mkdir -p "$WORK/bin"
WAYMARK="$WAYMARK_BIN"

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mFAIL:\033[0m %s\n' "$*" >&2; docker compose --project-directory "$WAYMARK_DIR" -f "$WAYMARK_DIR/docker-compose.prod.yml" logs --tail 60 >&2 || true; exit 1; }
cleanup() {
    docker compose --project-directory "$WAYMARK_DIR" -f "$WAYMARK_DIR/docker-compose.prod.yml" down -v >/dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

https() { curl -fsSk -m 20 --resolve "$1:443:127.0.0.1" "https://$1$2"; }
signin() { # user password -> exit status
    curl -fsSk -m 20 -o /dev/null -H 'content-type: application/json' \
        -d "{\"username\":\"$1\",\"password\":\"$2\"}" https://localhost/signin
}

step "Bootstrap exactly as INSTALL.md says"
cd "$WORK"
docker run --rm "$IMAGE" cat deploy/install.sh > install.sh
bash install.sh | tee install.log
grep -q "All done!" install.log || fail "install.sh didn't finish"

step "The site answers over HTTPS"
https localhost /healthz >/dev/null || fail "/healthz over https"
https localhost / | grep -qi "waymark" || fail "homepage"
code=$(curl -sk -m 20 -o /dev/null -w '%{http_code} %{redirect_url}' --resolve www.localhost:443:127.0.0.1 https://www.localhost/trails)
[ "$code" = "301 https://localhost/trails" ] || fail "www redirect: $code"

step "Settings were written"
grep -q '^SITE_DOMAIN=localhost$' "$WAYMARK_DIR/.env" || fail "SITE_DOMAIN"
grep -q '^ADMINS=\["trailboss"\]$' "$WAYMARK_DIR/.env" || fail "ADMINS"
grep -qE '^POSTGRES_PASSWORD=[0-9a-f]{48}$' "$WAYMARK_DIR/.env" || fail "POSTGRES_PASSWORD"
[ "$(stat -c %a "$WAYMARK_DIR/.env")" = "600" ] || fail ".env should be private"

step "The owner account works"
signin trailboss first-password-1 || fail "owner sign-in"

step "Running it again leaves the install alone"
bash install.sh | grep -q "already installed" || fail "second run"

step "An interrupted install resumes, keeping the database password"
before=$(grep '^POSTGRES_PASSWORD=' "$WAYMARK_DIR/.env")
rm "$WAYMARK_DIR/.installed"
bash install.sh | tee resume.log
grep -q "All done!" resume.log || fail "resume didn't finish"
grep -q "already exists" resume.log || fail "resume should find the account"
[ "$(grep '^POSTGRES_PASSWORD=' "$WAYMARK_DIR/.env")" = "$before" ] || fail "database password changed"
signin trailboss first-password-1 || fail "sign-in after resume"

step "waymark status / version / help"
"$WAYMARK" status | tee status.log
grep -q "The app answers" status.log || fail "status"
grep -q "https://localhost works" status.log || fail "status https"
"$WAYMARK" version | grep -q "Version:" || fail "version"
"$WAYMARK" help | grep -q "waymark update" || fail "help"

step "waymark backup"
"$WAYMARK" backup
day=$(date +%F)
[ -s "$WAYMARK_DIR/backups/waymark-db-$day.sql.gz" ] || fail "database backup"
[ -s "$WAYMARK_DIR/backups/waymark-images-$day.tar.gz" ] || fail "photo backup"

step "waymark reset-password"
WAYMARK_NEW_PASSWORD=second-password-2 "$WAYMARK" reset-password TrailBoss
signin trailboss second-password-2 || fail "new password"
if signin trailboss first-password-1; then fail "old password still works"; fi

step "waymark restore (puts back the backup, from before the reset)"
echo RESTORE | "$WAYMARK" restore "$day"
signin trailboss first-password-1 || fail "restored password"

step "waymark update (same image, forced) keeps the site up"
WAYMARK_FORCE=1 "$WAYMARK" update | tee update.log
grep -q "Updated and running" update.log || fail "update"
https localhost /healthz >/dev/null || fail "after update"

printf '\n\033[32mInstall guide: all steps work.\033[0m\n'
