# Translating Waymark Gear

The site's menus, buttons and page text can be shown in other languages.
What people write themselves (lists, gear names, reviews, comments) is never
translated: it shows as they wrote it.

## How a language is chosen

1. **Their choice.** The language picker in the footer, or **Your profile →
   Language**. It's saved in a `wg_lang` cookie for that browser and, for
   members, in their profile, so it follows them to every device they sign
   in on.
2. **Their browser.** With no choice made, the first language in their
   browser's list that we have (Spanish for `es-MX`, Brazilian Portuguese
   for `pt` and `pt-PT`, Simplified Chinese for `zh-CN` and `zh-Hans` but
   not Traditional).
3. **English** otherwise.

## Units

Separate from language: each reader sees **imperial** (oz, lb, in, °F) or
**metric** (g, kg, cm, °C). The footer's Units picker or **Your profile →
Units** chooses (a `wg_units` cookie, and `users.units` for members);
without a choice, the browser's region decides: US, Liberia and Myanmar get
imperial, everyone else metric, and a browser that names no region gets
imperial. A member who switches also switches their lists (oz ↔ g, lb ↔ kg;
weights are stored in mg, so nothing is lost). The code is
`client/utils/units.js`; server pages read `currentUnits()` from
`server/i18n.js`, the app `currentUnits()` and `bigWeightUnit()` from
`client/utils/i18n-app.js`.

## The files

`locales/en.json` is the source: every piece of text the site translates,
under a key such as `nav.explore`. Each other language has a file with the
same keys, e.g. `locales/fr.json`.

```json
{
  "_meta": { "name": "Français", "status": "Reviewed by …" },
  "nav.explore": "Explorer",
  "explore.items": { "one": "{count} article", "other": "{count} articles" },
  "explore.itemsOf": "{shown} sur {total} articles"
}
```

- **`{placeholders}`** are filled in by the site. Keep the same ones as the
  English, in whatever order the sentence needs.
- **Plurals** are an object of forms, one for each of the language's plural
  categories (`one`, `few`, `many`, `other`...). English and French need `one`
  and `other`, Polish needs `one`, `few` and `many`, and Japanese, Chinese
  and Korean need only `other`. `npm run i18n:check` says which forms a
  language needs.
- **Anything missing or empty shows in English**, so a half-done file is safe
  to ship.
- `_meta.status` is a free note on how finished or reviewed the file is.

## Adding a language

```sh
npm run i18n:add -- sv Svenska
```

This creates `locales/sv.json` with every key empty, and adds Svenska to the
language picker (`LANGUAGES` in `client/utils/i18n.js`). Fill in the values,
then:

```sh
npm run i18n:check             # how complete each language is, and mistakes
npm run i18n:check -- --missing  # also list every untranslated key
```

The check fails on mistakes that would look wrong on the site:
- a placeholder added or dropped;
- a missing plural form;
- a key the English file doesn't have (usually one that was renamed);
- broken JSON.

Untranslated keys are only reported.

For a right-to-left language (Arabic, Hebrew, Persian), also add
`dir: 'rtl'` to its entry in `LANGUAGES`. Pages then get `dir="rtl"`, but the
layout hasn't been tested right-to-left yet.

## Adding text to the site

Use a key instead of writing English straight into a page:

- **In the app (Vue):** `{{ $t('section.key') }}`, or
  `:placeholder="$t('section.key')"` for an attribute. Pass values with
  `$t('explore.items', { count })`.
- **In server templates (Mustache):** `{{#t}}section.key{{/t}}`. If the text
  needs values, build it in the route with `currentT()` (`server/i18n.js`)
  and pass the result in the model.
- **In server code:** `const t = currentT(); t('section.key', { name })`.

Add the key and its English to `locales/en.json`. `npm run i18n:check` fails
if the code uses a key `en.json` doesn't have. Other languages show the
English until they're translated.

## What's translated so far

The first ten languages have **first-draft, machine-assisted translations**.
Each file says so in `_meta.status`. Have a native speaker review a language
before promoting the site in it.

| Translated now | Still English |
| --- | --- |
| Header, menus, footer, the language and units pickers | Gear spec choices (e.g. "Freestanding") |
| Sign in, register, password recovery | Trails, brands, reviews, kits and leaderboard pages |
| Profile language and units settings | Trip journals, pack mode, notifications, settings dialogs |
| Explore (index, filters, sort, counts, spec names) | Owner and moderation tools |
| Gear page headings, ratings, buying | Emails, error messages, Privacy/Terms/Accessibility |
| List editor basics, Share menu | |

To bring another page across, swap its English for keys as above, then add
the new keys to each language (or leave them for translators: they show in
English until filled in).
