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
whatever you choose to put in your gear lists.
<!-- if analytics -->
We don't run ads. We use Google Analytics to count visits and see which pages
are used (see [Analytics](#analytics)); it's skipped entirely if your browser
sends Global Privacy Control or Do Not Track. We have never sold or shared your
data with anyone for marketing purposes.
<!-- else -->
We don't run ads, we don't use analytics or tracking cookies, we don't have
third-party trackers of any kind, and we have never sold or shared your data
with anyone for marketing purposes.
<!-- end if -->
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

### Planning a list together

If you invite people to plan one of your lists, they can see and edit that
list and the gear in it (not your other lists or the rest of your closet),
and you can see theirs while you're both looking at it ("here now"). Gear
they add belongs to your list. You can remove people at any time, and they
can leave.

### Trip journals and gear reviews

Trip journals are private unless you choose otherwise: "Your followers" shows
a trip to people who follow you, "Everyone" makes it a public page. Photos
you add are stored with your other uploads. Gear reviews are public and show
your username; you can edit or delete yours, and moderators can hide reviews
that break the rules. Deleting your account deletes your trips; your reviews
are deleted too.

### Trail tags

If you tag a list with a trail (and a year and direction), that tag is shown
with the list when you publish it, and the list counts toward that trail's
page. Trail names you type that aren't in our list yet are visible to the
site owner, with how many people used them (not who), so they can be added.

### Wishlist, price alerts and buy links

Gear you add to your wishlist is stored with the rest of your closet. If a
catalog price drops for something on it, we tell you in the app and, if you
choose, by email. When you follow a **Buy** link we count the click (per item
and per day, with no record of who clicked) so we can see which gear people
buy; the shop then sees you arrive, as with any link. If you're not a
Supporter, the link carries our affiliate code, which tells the shop the
visit came from us.

### Supporter plan

If you subscribe, Stripe handles the payment and stores your card; we
receive your Stripe customer number, the plan and when it renews. We don't
see or store card details.

### AI assistants and API tokens

If you connect an AI assistant or make an API token, the assistant or
software you connected can read your closet, wishlist and lists (and change
them, if you allowed that). We store a fingerprint of each token, its name,
when it was made and when it was last used; the token itself is shown to you
once and never stored. What an assistant does with the data it reads is up to
that assistant's provider and its privacy policy. Disconnect or revoke any of
them at /developers.

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

<!-- if analytics -->
**We set no advertising cookies.** Google Analytics sets its own cookies
(`_ga`, `_ga_*`), described under [Analytics](#analytics).

<h3 id="analytics">Analytics</h3>

We use Google Analytics to understand how the site is used: which pages are
visited, roughly where from, on what kind of device, and how people arrived.
Google receives this from your browser along with your IP address (which
Google Analytics doesn't store), and sets the `_ga` and `_ga_*` cookies (up to
2 years) to tell repeat visits apart. It never receives your username, email
address, or what's in your lists. Google's script loads only after the page
has finished, and **not at all if your browser sends Global Privacy Control or
Do Not Track**. Shared lists embedded on other websites never load it.

**In the EU/EEA, the UK and Switzerland, Analytics is off until you agree**: a
banner asks first, with "Reject all" as easy as "Accept all", and nothing from
Google loads unless you say yes. We guess where you are from your browser's
time zone; if we can't tell, we ask. Everywhere else it's on unless you turn it
off. Either way you can change your mind at any time under **Cookie settings**
at the bottom of every page; turning it off removes Google's cookies. Your
choice is kept in a `wg_consent` cookie for a year. Ad features and Google
signals are always off; we don't show ads. You can also block Analytics with
Google's [opt-out add-on](https://tools.google.com/dlpage/gaoptout).
<!-- else -->
**We set no advertising, analytics, or tracking cookies**, and no third party
sets cookies through our site.
<!-- end if -->

## What we don't do

- We don't run ads.
<!-- if analytics -->
- We don't use any analytics service other than Google Analytics, described above.
- We don't embed advertising trackers, pixels, or social widgets.
<!-- else -->
- We don't use Google Analytics or any other analytics service.
- We don't embed third-party trackers, pixels, or social widgets.
<!-- end if -->
- We don't sell, rent, or trade your personal information.

## Who else handles your data

- **[HOSTING PROVIDER]** — hosts the application and database, and
  therefore stores everything above on our behalf.
- **Mailgun** — delivers the transactional email we
  send. Your email address is passed to Mailgun when we send transactional emails.
- **Stripe** — takes payments for the Supporter plan, if you subscribe. Stripe
  receives your email address and payment details directly.
<!-- if analytics -->
- **Google** — runs Google Analytics, which receives the visit details described
  under [Analytics](#analytics).
<!-- else -->
<!-- end if -->

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
