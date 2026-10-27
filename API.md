# Waymark Gear API

Read and change your gear from your own scripts, or connect an AI assistant.
Make a token at **/developers** (read only, or read and write) and send it on
every request:

```
Authorization: Bearer wg_…
```

Everything is JSON. Limits: 120 requests a minute per token. Weights come back
as `{ "mg": 538640, "display": "1.19 lb" }`: milligrams for arithmetic, and
the text in the owner's unit for showing.

## Endpoints

| | | |
|---|---|---|
| GET | `/api/v1/me` | Who you are; counts of lists, gear and wishlist |
| GET | `/api/v1/gear?include=owned\|wishlist\|retired\|all&q=` | Your closet |
| POST | `/api/v1/gear` | Add gear: `{ "catalogId": "…" }` or `{ "name", "weight", "unit", "description", "closetCategory" }`, plus `"wishlist": true` for the wishlist |
| PATCH | `/api/v1/gear/:id` | Change `name`, `description`, `weight` + `unit`, `closetCategory`, `condition` (`new`, `good`, `worn`, `replace`), `retired`, `wishlist` |
| GET | `/api/v1/lists` | Your lists with base, worn, consumable and total weight |
| POST | `/api/v1/lists` | Make a list: `{ "name", "description", "categories": ["Shelter", …] }` |
| GET | `/api/v1/lists/:id` | One list in full |
| GET | `/api/v1/lists/:id/check` | The gear check: readiness score, missing essentials, lighter catalog options, popular gear, calorie estimate |
| POST | `/api/v1/lists/:id/items` | Put gear in a list: `{ "category": "Sleep", "gearId": 12 }`, or `"catalogId"`, or a new item by `name`/`weight`/`unit`; optional `qty`, `worn`, `consumable` |
| DELETE | `/api/v1/lists/:id/items/:gearId` | Take gear out of a list (it stays in your closet) |
| GET | `/api/v1/catalog?q=&category=&limit=` | Search the gear catalog |

Errors: `401` no or bad token, `403` a read-only token tried to change
something, `404` not found, `400` with `{ "error", "message" }` for bad input.

Changes made through the API show up in open Waymark tabs straight away, and
in published lists.

## MCP (AI assistants)

`https://waymarkgear.com/mcp` is a Model Context Protocol server (streamable
HTTP, JSON responses). Assistants that support sign-in (Claude, ChatGPT) find
everything they need from the `401` it returns: OAuth 2.1 with PKCE and dynamic
client registration, metadata at `/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server`. Tools that don't can send a
personal token as a bearer token instead.

Tools: `get_profile`, `get_closet`, `get_lists`, `get_list`, `check_list`,
`search_catalog`, and with write access `add_gear`, `update_gear`,
`create_list`, `add_to_list`, `remove_from_list`.
