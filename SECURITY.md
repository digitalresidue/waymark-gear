# Security

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it
privately instead:

1. Go to the repository's **Security** tab → **Report a vulnerability**
   (GitHub's private vulnerability reporting), or open
   `https://github.com/digitalresidue/waymark-gear/security/advisories/new`.
2. Say what you found, how to reproduce it, and what it lets someone do.

You'll get an answer within a few days. Once it's fixed and released, the
advisory is published with credit to you (unless you'd rather not).

## What's in scope

- The Waymark Gear app and API in this repository (`server/`, `client/`,
  `templates/`).
- The server set-up in `deploy/` (`install.sh`, the `waymark` command,
  the compose stack and Caddyfile).

Problems in someone else's installation (a weak password, an outdated
server) are for that site's owner. Problems in dependencies are welcome if
they affect Waymark; otherwise report them upstream.

## Supported versions

Only the latest release (the `:latest` image, what `waymark update`
installs) gets security fixes. Site owners: keep up to date with
`waymark update` (see [INSTALL.md](INSTALL.md)).

## For site owners

- Never commit `.env` or paste its contents in an issue: it holds your
  database password and API keys.
- If a key may have leaked, rotate it at the provider (Stripe, Mailgun,
  Google) and update it with `waymark settings`.
