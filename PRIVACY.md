# Privacy Policy

**Effective date:** [DATE]

> **Draft, not yet in effect.** Adapted from LighterPack's policy to match how
> Waymark Gear works. Replace every [bracketed] item, remove this note, and have
> it reviewed before launch.

Waymark Gear is a website for planning, weighing and sharing the gear you take
on adventures. It is operated by [OPERATOR NAME] and is open source under the
GPL-2.0 license — you can read every line of the code that handles your data at
[SOURCE URL].

## The short version

We collect the minimum needed to run the site: a username, an email address, and
whatever you choose to put in your gear lists. We don't run ads, we don't use
analytics or tracking cookies, we don't have third-party trackers of any kind,
and we have never sold or shared your data with anyone for marketing purposes.
You can delete your account yourself at any time.

The rest of this document is the detail.

## What we collect

### Account information

When you create an account we store:

- **Your username**
- **Your email address** - for account recovery
- **Your password** - hashed with bcrypt.
- **The date you registered and last visited** - for debugging and diagnostics
- **If you sign in with Google:** your Google account ID and the email address
  Google confirms, so we can recognize you next time. We don't receive your
  Google password or access anything else in your Google account.

Everything you enter into Waymark Gear, including list names, item names, descriptions,
weights, prices, quantities, links, and the images you upload, is stored in our
database and associated with your account. We attempt to strip all EXIF metadata from uploaded images.

### Your public profile (optional)

Your profile at `/@username` shows only what you choose to add: a name, trail
name, bio, profile picture, banner, and links to other sites, plus the lists
you've published. You can hide your profile at any time from **Your profile**.

### Comments and notifications

Comments you post on published lists are public and show your username,
name and profile picture. We store notifications (who commented or replied,
on which list) so we can show them to you. If you report a comment, the
moderators can see that you reported it and why; the author can't.

### On your device

The app keeps a copy of your gear list in your browser's local storage so it
opens without a signal. It's removed when you sign out. Your light/dark mode
choice is stored there too.

### Importing from LighterPack

When you paste a LighterPack link, our server fetches that list's public
pages from lighterpack.com to read it. Nothing about you is sent to
LighterPack.

### Server logs

Every request to the site is logged. Each log line records:

- your IP address
- your browser's user-agent string
- the URL requested and the referring URL
- the HTTP method, response status, response size, and response time
- your username, if you were signed in
- a random request identifier

These logs exist to debug problems, understand load, and investigate abuse.

### Cookies

Waymark Gear sets two cookies, both functional:

| Cookie | Purpose | Lifetime |
| --- | --- | --- |
| `lp` | Your session token — this is what keeps you signed in. Not readable by JavaScript. | 90 days |
| `lp_loggedin` | A flag that tells the page you're signed in so it can render the right navigation. Contains no personal data. | 90 days |

**We set no advertising, analytics, or tracking cookies**, and no third party
sets cookies through our site.

## What we don't do

- We don't run ads.
- We don't use Google Analytics or any other analytics service.
- We don't embed third-party trackers, pixels, or social widgets.
- We don't sell, rent, or trade your personal information.

## Who else handles your data

- **[HOSTING PROVIDER]** — hosts the application and database, and
  therefore stores everything above on our behalf.
- **Mailgun** — delivers the transactional email we
  send. Your email address is passed to Mailgun when we send transactional emails.

Uploaded images are stored on our own servers.
No one else receives your data, except where required by law.

## Email we send you

We send a few kinds of email:
- Emails you asked for - username reminder, password reset
- Comment notifications - when someone comments on your list or replies to
  you, at most one every 15 minutes. Turn them off on **Your profile**.
- Service emails - if something needs your attention

We do not send marketing email.

## Lists you share are public

When you share a list, Waymark Gear gives it a URL. Anyone who has
that link can view the list, embed it, or export it as CSV — **no account and no
password is required.** Shared list URLs are hard to guess but they are unlisted, not private.

If you **publish** a list, it's also listed on Explore, on your profile, and in
our sitemap for search engines, and anyone can comment on it.

Images you upload are likewise served from public URLs and can be viewed by
anyone who has the link.

## Support and moderation access

Site moderators can search accounts by username or email address, reset a
user's password, and sign a user out of all sessions. They review reported
comments and can hide them. This exists to handle account-recovery requests
and abuse reports. Moderators cannot read your password.

## Deleting your account and accessing your data

You can delete your account yourself from **Account → Delete account**. It asks
for your password to confirm.

Deleting your account **immediately and permanently removes**:

- your user record, including your email address and password hash
- your profile, notifications and comment reports
- all of your gear lists and their contents, and the comments on them
- your uploaded photos

Comments you left on other people's lists are emptied and shown as
"deleted", so the replies other people wrote to them still make sense.

## Your rights

You have the right to:
 - Delete your account and all its associated data
 - Export all of your data

You can delete your account yourself from the Account Settings menu. For a data export you can email us.

## Law enforcement and legal requests

We will disclose information if we are legally required to.

## Contact

Questions about this policy, or about your data: **[CONTACT EMAIL]**
