# Nutrition Tracker Zero

A daily voice food log for a few friends, running on free tiers only. At each person's call time their
phone rings **inside the app** (a full-screen call, like a normal phone call). Answering starts a
**Vapi web call**. The assistant asks what they ate, reads the list back, and saves it through a
webhook. Nutrition comes only from a **shared foods table that people fill in**. Our side makes no LLM
or nutrition-API calls. Once anyone enters a food's values, everyone's past logs of that food count
automatically.

[PLAN.md](PLAN.md) has the design and the reasoning behind it.

| Path | What |
|---|---|
| [worker/](worker/) | Cloudflare Worker (TypeScript, zero runtime deps), D1 migrations, tests, `scripts/replay-vapi.mjs` |
| [app/](app/) | Bare React Native 0.83.1 app (Android first; iOS builds for your own phone) |
| [scripts/migrate-from-mongo/](scripts/migrate-from-mongo/) | One-off import of the old app's history |

---

## Worker

### Local development

```sh
cd worker
npm install
cp .dev.vars.example .dev.vars          # APP_TOKEN for wrangler dev
npm run db:migrate:local
npm run dev                             # http://localhost:8787
curl localhost:8787/health
```

### Tests

```sh
npm test             # 124 unit + integration tests in the Workers runtime (local D1)
npm run typecheck
```

Integration tests cover the D1 features we rely on, the cross-user resolution cascade, the Vapi webhook
scenarios (save, duplicate, correction, no-list, start failure, metadata fallback) and a scan proving no
response contains a stored Vapi key.

### Replaying Vapi webhooks

```sh
APP_TOKEN=dev-app-token-change-me node scripts/replay-vapi.mjs \
  --base http://localhost:8787 --user "Asha" --local --scenario all     # save | duplicate | correction | no-list
```

The script reads the profile's webhook token from D1 through wrangler (it is never printed), posts the
sample payloads from `test/fixtures/vapi/`, and checks the results through the API. Use `--remote`
and the workers.dev URL to run it against production.

### API

All routes need `Authorization: Bearer <APP_TOKEN>` except `/health` and the webhook. Routes marked † also
need `X-User-Id`. Errors look like `{"error": {"code", "message"}}`.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness |
| `GET /meta` | Units, base units, meals, nutrient catalog |
| `GET/POST /profiles` | List / create profiles (409 `name_taken`) |
| † `GET/PUT /me/settings` | Name, timezone, call time, enabled, `vapi.configured`, last call. PUT accepts `vapiPublicKey` (write-only) |
| † `GET/PUT /me/goals` | Daily targets; `null` resets to the default |
| † `POST /calls/start {kind}` | Records the call; returns `{callId, publicKey, assistant}` (the only response carrying the key) |
| † `POST /calls/:id/started` · `POST /calls/:id/failed` | Link the Vapi call id / record a client-side failure |
| † `GET /calls/latest` | Last call result |
| † `GET /days/:date` · `GET /days?from&to` | A day with per-item nutrients and totals / per-day totals (≤ 62 days) |
| † `POST /days/:date/items` · `PATCH/DELETE /items/:id` | Manual add (optionally onto a no_list call) / edit / delete |
| `GET /uncached` | Unknown foods (with "did you mean") and missing unit conversions, across all users |
| `GET/POST /foods` · `GET/PUT /foods/:id` | Shared foods; writes return `resolvedCount` |
| `POST/DELETE /foods/:id/aliases[/:alias]` · `PUT/DELETE /foods/:id/units/:unit` | Aliases and unit conversions (each re-resolves affected items) |
| `POST /maintenance/resolve-pending` | Re-match all pending items (run after an import) |
| `POST /vapi/webhook/:token` | Vapi `tool-calls` and `end-of-call-report` |

---

## App

### Configure

```sh
cd app
npm install
cp src/config/local.example.ts src/config/local.ts    # git-ignored: API_BASE_URL, APP_TOKEN
```

- **Local Worker on the emulator or a USB phone:** keep `API_BASE_URL = 'http://localhost:8787'` and run
  `npm run adb:reverse`, which reverses ports 8787 and 8081.
- **Deployed Worker:** set `API_BASE_URL` to the workers.dev URL and `APP_TOKEN` to the production token.

### Run (debug)

```sh
npm start                                                   # Metro
cd android && ./gradlew app:installDebug -PreactNativeArchitectures=arm64-v8a
```

The app id is `com.nutritiontrackerzero`, so it installs next to the old app.

### Release APK for friends

1. Make a keystore **outside the repo**, once:
   ```sh
   keytool -genkeypair -v -storetype PKCS12 -keystore ~/keys/ntz-release.jks -alias ntz -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add to `~/.gradle/gradle.properties` (not the repo):
   ```
   NTZ_RELEASE_STORE_FILE=/Users/<you>/keys/ntz-release.jks
   NTZ_RELEASE_STORE_PASSWORD=…
   NTZ_RELEASE_KEY_ALIAS=ntz
   NTZ_RELEASE_KEY_PASSWORD=…
   ```
3. With `local.ts` pointing at the deployed Worker:
   `cd android && ./gradlew app:assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.
   Without the properties the APK is built unsigned.

### iOS (your own phone)

`cd ios && pod install`, open `habit_builder_app.xcworkspace` in Xcode, choose your personal team, and run.
Free Apple IDs expire apps after 7 days, and PushKit/APNs needs the paid program, so iOS rings via a
time-sensitive local notification plus CallKit while the app is in the foreground.

### Tests

```sh
npm test            # Jest: API client, schedule math (incl. DST), ring payloads, conversions, reconciliation
npm run typecheck
npm run lint
```

### How the daily call works

- **Arming.** A Notifee alarm (exact `SET_ALARM_CLOCK` when allowed) fires at the call time in the
  profile's time zone. Its headless handler asks the native `IncomingCall` service to ring full screen.
- **Answer.** Opens the call screen, which runs `POST /calls/start`, then `vapi.start(assistant)`, then
  `POST /calls/:id/started`.
- **No answer after 60 s.** A missed-call notification appears with **Log now** and **Snooze (10 min)**.
  A scheduled call also re-rings **once** 60 min later; the native side schedules this, so it works with
  the app killed. Snooze replaces that retry. A decline never retries.
- **Recovery.** Every launch and resume re-arms from the cached schedule. Settings has **Send test call
  now** and **Reminder health**.

---

## Deploy (Phase 5)

**You, in a browser (one time):**
1. Create a free account at `dash.cloudflare.com/sign-up` (no card needed).
2. Workers & Pages → choose your **workers.dev subdomain**.
3. Run `cd worker && npx wrangler login` and click **Allow** in the browser tab that opens.

**Then, from the CLI:**
```sh
cd worker
npx wrangler whoami
npx wrangler d1 create nutrition-zero --binding DB --update-config     # writes database_id into wrangler.jsonc
npx wrangler d1 migrations apply nutrition-zero --remote
openssl rand -base64 32 | tr -d '\n' | tee /dev/tty | npx wrangler secret put APP_TOKEN   # copy it into app/src/config/local.ts
npx wrangler deploy                                                      # prints https://nutrition-tracker-zero.<sub>.workers.dev
curl https://nutrition-tracker-zero.<sub>.workers.dev/health
```

Never upgrade a plan or enter payment details. The free tiers (Workers: 100k requests/day; D1: 5M row
reads and 100k row writes/day) are far above what this app uses.

---

## Onboarding a friend

1. Create a free account at vapi.ai and copy the **public** key from Dashboard → API Keys.
   (The free $5 credit lasts roughly 2–3 weeks of daily ~3 min calls; after that Vapi asks them for a card.)
2. Install the APK. Create a profile, set a call time, and allow notifications, exact alarms and full-screen calls.
3. Settings (tap your initials, top right) → paste the Vapi key → **Send test call now**.

---

## Migrating the old app's history (Phase 6)

```sh
cd scripts/migrate-from-mongo
npm install
npm test && npm run test:e2e                      # transform tests + apply sample SQL to a throwaway local D1
MONGODB_URI='…' npx tsx migrate.ts --dry-run      # counts, date styles, sample rows; writes nothing
MONGODB_URI='…' npx tsx migrate.ts                # writes out/import.sql (git-ignored)
cd ../../worker && npx wrangler d1 execute nutrition-zero --remote --file ../scripts/migrate-from-mongo/out/import.sql
curl -X POST https://<worker>/maintenance/resolve-pending -H "authorization: Bearer <APP_TOKEN>"
```

What carries over:
- Users with their call time and time zone; email and password are dropped.
- Every food entry, as a pending `import` item.
- Custom nutrient targets.

What doesn't: the old nutrition values. They all came from Spoonacular, Groq or USDA, and the new app
uses only values people enter. The imported history fills **Uncached** with your real foods, most-logged
first. Re-running the import is safe.

---

## Notes and known limits

- **Not yet verified against a live Vapi call.** The Phase 3 spike needs a Vapi public key. It checks
  that webhooks fire for web calls and records real payloads as fixtures. The assistant's
  model/voice/transcriber in `worker/src/vapi/assistant.ts` are defaults until the old dashboard
  assistant's values are copied in.
- **The webhook token is part of the URL.** Request logs (wrangler's console, Workers Logs) therefore show
  it, and only the account owner can read those. The Worker's own log lines record ids and statuses only.
- **The shared `APP_TOKEN` ships inside the APK.** That's fine for friends-only, non-sensitive data;
  anyone holding it could act as any profile.
- **Device alarms are the weak point** (Doze, OEM battery killers). The Reminder health screen shows what to fix.
- **One deviation from PLAN.md §7:** the singularizer strips a trailing "s" after "is" too, so
  idlis→idli and chapatis→chapati work as the plan's examples require.
