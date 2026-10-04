# Nutrition Tracker Zero

Daily voice food log for a few friends, running on free tiers only: a Cloudflare Worker + D1 backend
and a bare React Native app. At the user's call time the phone rings inside the app; answering starts a
Vapi web call whose assistant saves the confirmed food list through a webhook. Nutrition comes only from
a shared, human-entered foods table: no LLM or nutrition API calls on our side.

See [PLAN.md](PLAN.md) for the design and the reasoning behind it.

## Layout

| Path | What |
|---|---|
| [worker/](worker/) | Cloudflare Worker (TypeScript, zero runtime deps) + D1 migrations + tests |
| `app/` | Bare React Native 0.83 app (Phase 4) |
| `scripts/migrate-from-mongo/` | One-off import from the old MongoDB (Phase 6) |

## Worker: local development

```sh
cd worker
npm install
cp .dev.vars.example .dev.vars            # sets APP_TOKEN for wrangler dev
npm run db:migrate:local
npm run dev                               # http://localhost:8787
curl localhost:8787/health
```

Android emulator or USB device: `adb reverse tcp:8787 tcp:8787`, then the app can use `http://localhost:8787`.

### Tests

```sh
npm test            # unit + integration tests in the Workers runtime (local D1, isolated)
npm run typecheck
```

### Replaying Vapi webhooks

Sends the sample `tool-calls` / `end-of-call-report` payloads from `test/fixtures/vapi/` to a running Worker.
The profile's webhook token is read from D1 via wrangler and never printed. With `APP_TOKEN` set, the results
are verified through the API.

```sh
APP_TOKEN=dev-app-token-change-me node scripts/replay-vapi.mjs \
  --base http://localhost:8787 --user "Asha" --local --scenario all   # save | duplicate | correction | no-list
```

## API summary

All routes need `Authorization: Bearer <APP_TOKEN>` except `/health` and the Vapi webhook. `†` routes also need
`X-User-Id`. Errors are `{"error": {"code", "message"}}`.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness |
| `GET /meta` | Units, base units, meals, nutrient catalog |
| `GET/POST /profiles` | List / create profiles (409 `name_taken`) |
| † `GET/PUT /me/settings` | Name, timezone, call time, enabled, `vapi.configured`, last call. PUT accepts `vapiPublicKey` (write-only) |
| † `GET/PUT /me/goals` | Daily targets; `null` resets to the default |
| † `POST /calls/start {kind}` | Records the call; returns `{callId, publicKey, assistant}` |
| † `POST /calls/:id/started {vapiCallId}` · `POST /calls/:id/failed {reason}` | Link the Vapi call / record a client failure |
| † `GET /calls/latest` | Last call result |
| † `GET /days/:date` · `GET /days?from&to` | Day detail with per-item nutrients and totals / per-day totals (≤ 62 days) |
| † `POST /days/:date/items {items, callId?}` | Manual add |
| † `PATCH/DELETE /items/:id` | Edit (re-matched) / delete |
| `GET /uncached` | Unknown foods (with suggestions) and missing unit conversions, across all users |
| `GET/POST /foods` · `GET/PUT /foods/:id` | Shared foods cache; writes return `resolvedCount` |
| `POST /foods/:id/aliases` · `DELETE /foods/:id/aliases/:alias` | Same-as-existing-food links |
| `PUT/DELETE /foods/:id/units/:unit {servings}` | Unit conversions |
| `POST /vapi/webhook/:token` | Vapi `tool-calls` and `end-of-call-report` |

## Notes

- The webhook token is part of the URL, so request logs (wrangler's console, Workers Logs) show it. Only the
  account owner can read those. The Worker's own log lines record ids and statuses only.
- The Vapi assistant's model/voice/transcriber are defaults in `worker/src/vapi/assistant.ts` until the old
  dashboard values are copied in (PLAN.md §13, input 1).

Deploy, app setup and onboarding sections are added in Phases 5–6.
