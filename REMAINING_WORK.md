# What is left (as of 2026-10-13)

**State.** All of [WEEKLY_BREAKDOWN_PLAN.md](WEEKLY_BREAKDOWN_PLAN.md) (Phases 0 to 6) and the India (ICMR-NIN) set are implemented, and
so is a second round (2026-10-12/13) that put useful information ahead of the score, split the engine into four modules, and added
checks on food and portion accuracy (see *What changed in the second round* below). Every decision in the plan's section 12 was taken
**as recommended**, because none was answered. **Nothing is committed** (the earlier UI redesign is still staged but uncommitted; the
plan, the new files and this round are untracked or unstaged).

Last runs (2026-10-13, after the phone-call audio work): Worker 46 files / 736 tests pass. App 44 suites / 852 tests pass, `tsc` clean, eslint 0 errors (2 old warnings).

## 0. Deployed on Cloudflare's free plan (2026-10-13)

The Worker runs at `https://nutrition-tracker-zero.nutrition-tracker-zero-worker.workers.dev` (account padigelaajay1@gmail.com, D1
`nutrition-zero` in APAC, migrations 0001 to 0005 applied, `APP_TOKEN` set as a secret and kept only in the git-ignored
`app/src/config/local.ts`). A real Vapi web call from the emulator saved its items through the webhook and closed `tool_saved` with
the transcript and duration, so webhooks do fire for in-app web calls (the PLAN.md section 1 open question). The test profile was
deleted afterwards; the database is empty. The phone APK (`ON_DEVICE = false`) talks to this Worker.

## 0b. On-device mode (2026-10-13): no server to host (kept as an option)

The app can run the whole Worker inside itself on the phone's SQLite (`ON_DEVICE = true` in `app/src/config/local.ts`), so nothing has
to be deployed. See the README's *On-device mode* section. What it changes for the list below: the Cloudflare deploy and its
migrations are not needed for a phone that runs this way; the foods table is the owner's alone (no friends sharing it); the data lives
only on the phone, with no backup (a reinstall or clearing the app's storage erases it). Tests: Worker 682, app 498. Not done: iOS
(the layer is portable, but nothing was built or run there); a way to back up or move the data to another phone.

## 0c. Food logging redesign, paste entry and the light/dark choice (2026-10-13)

Three requests, all uncommitted like everything else (see the README's *Logging food, and entering a food's values*):

- **Food logging.** The log screen is rebuilt as a list you add to (meal tiles, one-tap chips, a searchable dropdown, amount steppers,
  add-new-food) and personalised per profile and per meal from `GET /foods/history` (frequency and recency, the person's own log only).
  Common foods for a meal appear only when the profile has nothing logged for it. Each food keeps the meal it was added under, so a
  whole day can be entered in one visit; with no meal chosen, foods go under Other. Tests since on-device mode: Worker +34 (`history`,
  `foodHistory`, the part-of-whole rules), app +276 (`foodChoices`, `logFood`, `amounts`, `foodData`, `looseJson`, `foodEditor`, ...).
- **The food form.** Every nutrient is in view and an empty field is saved as 0. A second way in: *Paste data* (a prompt to copy into any
  chat assistant, and a reader that validates the answer with line-level errors).
- **Appearance.** Settings has System / Light / Dark (it is still there when the server cannot be reached).

An independent review of the work found real problems and they are fixed: the Worker's part-of-whole rules refused a food with a macro left
empty; the app's fallback catalogue held 9 of the Worker's 21 nutrients (and is now whole, and asks /meta again a few times when it could
not be reached); a food typed under a plural or different spelling was offered as new; an old food's unknown values were turned into 0
on edit; and a few error and busy states.

**To use it:** the Worker has one new route, a relaxed rule and **no migration**, so deploy with `cd worker && npm run deploy` (free plan,
nothing else changes), then rebuild the APK. Until the Worker is deployed the new app still works: the log screen says it could not load
the usual foods (with a Retry) and offers the common foods and the foods list; and the old Worker still refuses a partly filled food
whose parts look larger than an empty whole. On-device mode needs nothing extra.

**Worth a second look**

- *Empty means 0.* It is what was asked for, and it has a cost: a new food saved with fields left empty counts as a known zero, so the
  report's "foods with gaps" no longer lists it and a week built on it can read a nutrient as low rather than as a minimum. Editing an
  older food keeps its unknown values unknown when the field stays empty (the placeholder says Unknown); only a value that is typed
  becomes a number. The form asks before saving a food with nothing in it, or with no calories beside protein, carbohydrate and fat, and
  it does not ask the Worker's calories-against-macros question when a macro was only left empty.
- *A strictly personal list.* Once a profile has anything logged for a meal, only its own foods are suggested for that meal; the common
  foods are the fallback and never fill the list up. A profile with a single lunch food sees one chip for lunch (the dropdown still
  searches everything).
- *Clipboard.* React Native 0.83 still ships `Clipboard` (deprecated). It is used in one file, `src/services/clipboard.ts`; when the
  project moves to a React Native without it, install `@react-native-clipboard/clipboard` and change that file only.
- *Light/dark and the ring screen.* The choice reaches every React screen, dialogs and pickers; the native incoming-call screen is plain
  Android (`IncomingCallActivity`) and keeps following the phone's own setting, even when the app is set the other way.
- *Deleted:* `src/components/ItemForm.tsx` (nothing used it any more).
- Not run: iOS, a physical phone, a real chat assistant (the paste format was exercised with replies typed by hand, with the prompt
  copied and pasted back on the emulator, and with the reader's tests). Looked at on the emulator in light and dark, and at 360 dp with
  a larger font; the last round of changes (grouped list, the Other group, adding a new food from the log screen) was checked in dark.

## 0d. Login and Register (2026-10-13), deployed

The profile picker is gone: the app opens on **Log in**, with **Create an account** one tap away (`LoginScreen`, `RegisterScreen`,
`components/auth/`). Worker: `POST /auth/register` and `POST /auth/login` (`routes/auth.ts`), migration `0005_accounts.sql` (a nullable
`users.password_hash`), PBKDF2 in `auth.ts`; the on-device runtime got a PBKDF2 polyfill (`embedded/polyfills.ts`). Settings' "Switch
profile" is now "Log out". The README's *Accounts are deliberately basic* bullet lists what this does and does not protect.

**Live since 2026-10-13:** migration 0005 applied and the Worker deployed (version `7b8181d4`) after a database export (taken first, kept
outside the repo). A smoke test against the live Worker (register, five logins, wrong password, old routes, delete) passed with no
CPU-limit errors, so 20,000 iterations fits the free plan's 10 ms. The APK is `~/Downloads/NutritionTrackerZero-login.apk` (arm64, same
signing key and version code 1 as the earlier `NutritionTrackerZero.apk`, so it installs over it; **do not uninstall first**, that would
lose the stored profile id and the recovery code). `ON_DEVICE` builds need only the new APK.

**The live database already had one profile with no password** (created before accounts). It still works on a phone that is signed in to
it; once that phone logs out it cannot get back in. Decide whether it needs a "set a password" step.

**Not verified:** a real device or the emulator (tests, `tsc` and the live curl smoke test only, so the layout, keyboard handling and the
password toggle have not been seen); the on-device PBKDF2 speed in Hermes (1,000 iterations, sized by estimate).

**Decisions to revisit:** a username rather than an email (nothing here can send one, and `users.name` is already unique); no password
reset; a profile made before accounts cannot log in once logged out (it needs a "set a password" step, or a claim, which was left out as
a security decision for you); `GET/POST /profiles` still open to the shared token.

## 0e. Targets you set yourself, and the lock screen (2026-10-13), not deployed

- **Saving personal targets leaves the flow.** Step 6's Save (and the under-19 and reference-only end screens) take the flow's steps off
  the stack (`navigation/healthFlow.ts`), so Back from "Your targets" goes to where the flow was opened. Before, React Navigation 7's
  `navigate` pushed a new screen on top, so Back walked through all six steps.
- **Daily targets always closes on Save.** It used to stay open whenever the Worker sent a note (always for carbs or fat).
- **Any positive number is saved.** Values outside the usual range (plan 6.4) get a warning as they are typed and on "Your targets",
  which now also shows "Recommended: …" next to a custom number, a "Change your targets" row, and a Change button on each target.
  The Worker's `PUT /me/goals` no longer refuses values outside the bounds (only non-numbers, zero or less, over 100,000). Care-team
  numbers keep their typo guard.
- **Only the call screen shows over the lock screen.** `MainActivity` lost its static `showWhenLocked`/`turnScreenOn`; it turns them on
  when a call is answered and while the call screen is open (`setCallScreenShown`), and off when it closes, asking for the PIN. The ring
  screen no longer dismisses the keyguard. Until the call screen draws, a plain cover hides whatever page was open.

**Needs a Worker deploy** for the warnings and for values that used to be refused (the old Worker still refuses them; the app shows its
error). On-device builds have it already.

**Verified:** Worker and app tests, `tsc`, ESLint, the Kotlin build; on the emulator (a separate `.locktest` on-device build, since
removed): the flow's Save and Back, typing and saving targets outside the range, and, with a temporary PIN, a normal page staying behind the
lock, the call screen over it, Done asking for the PIN, and an answered ring opening only the call screen. **Left for your own test on a
phone:** whether the previous page flashes before the cover; "Log now" on a missed-call notification should now ask to unlock first (not
tried).

## 0f. Calls that work like a phone call: earpiece, speaker, proximity (2026-10-13), app only

- **Opens on the earpiece.** Daily (under Vapi) opened every call in its "video" mode, which is the **loudspeaker**. The app now puts
  it in "voice" mode before it joins, so a call starts on the earpiece, or on a headset when one is connected.
- **Phone | Speaker on the call screen**, plus **Bluetooth** or **Headphones** when connected; one tap switches at any time.
- **Screen off at the ear.** While the earpiece is in use the screen turns off against the ear and back on away from it, and the call
  screen ignores touches meanwhile. If the call ends at the ear, the screen stays off until the phone moves away.
- **Android:** a new native module, `CallAudio` (`android/app/src/main/java/com/nutritiontrackerzero/callaudio/`). It routes with
  `setCommunicationDevice` on Android 12+ (the speakerphone and Bluetooth SCO switches on 7 to 11) and holds a
  `PROXIMITY_SCREEN_OFF_WAKE_LOCK` (the system switches the screen and touch off, as dialers do). It puts the chosen route back if
  something else moves it (at most 3 times in 5 s), moves the call to a headset that connects mid-call, and falls back to the
  earpiece when one goes away. Vapi's own "re-apply Daily's route on every device change" listener is removed for the call.
  **iOS:** Daily routes (AVAudioSession); `IncomingCall.setProximityMonitoring` turns on UIDevice proximity monitoring for the
  earpiece. JS: `src/services/calls/callAudio.ts`, `audioRoute.ts`, `components/voice/AudioRouteControl.tsx`.
- **APK:** `~/Downloads/NutritionTrackerZero-calls.apk` (hosted mode, same key and version code; install over the old one, never
  uninstall first). No Worker change, nothing to deploy.

**Verified:** app tests (+4 suites: `audioRoute`, `callAudio`, `callAudioScreen`, `useVapiCallAudio`), `tsc`, ESLint, the Kotlin build,
the iOS Swift call against the iOS SDK. On the emulator (Android 16, a separate `.calltest` build, since removed): the module loads
through the bridge, starts, reports, ignores a route the phone lacks, and stops; with the emulator's virtual proximity sensor the
real screen-off lock turned the display **off** when near and **on** when far, kept it off when released while near, and was released
afterwards; the call screen's controls looked right in light and dark, at 360 dp with a 1.3x font.

**Not verified, needs your phone:** the emulator has **no earpiece** (speaker only), so routing between earpiece and speaker, and the
screen going off during a real call, were never seen together; nor were Bluetooth or wired headsets, or iOS (the iOS Pods predate several
native dependencies and were not rebuilt). Worth trying: start a call (it should be quiet until it is at your ear), hold it to your ear
(screen off), tap Speaker, connect Bluetooth earbuds mid-call.

**Decision to revisit:** every call opens on the earpiece, as a phone call does, including one started from the app's button. If you
would rather it remember Speaker, that is a small change.

**Vapi cost review: findings only, not acted on (you said to leave it for now).** Nothing in the Vapi settings was changed.
- The 9 calls in the Vapi account (all from testing, 10 to 13 Oct) total about 6 minutes. **3 ended on the silence timeout, and those 3
  are about half of all call time**: each waited about 30 s of silence before hanging up. The current API has no
  `silenceTimeoutSeconds` on an assistant any more; `hooks` with `customer.speech.timeout` can ask "Are you still there?" and end
  sooner.
- **The voice "Neha" was retired by Vapi on 1 March 2026** (their migration page names "Navya Kannan" as its replacement); the assistant
  still asks for it, so the voice you hear is Vapi's substitute. Pick a current voice deliberately (cheaper per-character options exist,
  such as Azure's `en-IN` voices).
- **Possible lost saves:** the model's default output limit is 250 tokens a turn; a `save_foods` call for a long day (about 20 tokens an
  item) can be cut off. Raising `model.maxTokens` costs nothing unless used.
- Vapi's own fee ($0.05 a minute) is the largest part of the bill, so call length matters most; `maxDurationSeconds` is 600 (10 min).
  The model (`gpt-4o-mini`) and transcriber (Deepgram `nova-3`, multilingual) are already low-cost choices. The Vapi MCP shows each
  call's status but not its cost; the dashboard's call log has the per-call breakdown.

## 1. Needs people, not code. Until these are done, keep the audience to your own circle

1. **Dietitian review** of the gate matrix, the calorie floors and caps, and every user-facing string (plan 8.7, 11.7).
2. **A reader with eating-disorder expertise** for low-pressure mode and the safety wording.
3. **Privacy and legal read** of the data inventory and the store declarations (DPDP Act, Apple, Google Play).
4. **A second person re-deriving every reference table** in `worker/src/domain/reference/{nasem,icmr}.ts`. The ICMR-NIN tables were typed
   from a college-hosted scan of the report and read twice by me, never by anyone else. A test snapshots a hash of each table, so a change
   shows up as a diff.
5. **Hindi strings** (plan Q23) are not written.
6. **Food values.** Nothing seeds the shared foods table: the common Indian foods your friends eat need their values entered from labels or
   a database, with their source and whether they are raw or as eaten. The report's "What is missing or uncertain" card and the Pending
   tab's "Foods with gaps" list show which ones matter most. Bulk-copying the Indian Food Composition Tables needs NIN's permission (Q14).

## 2. Done in this round, that were open before

1. **Independent security review: done.** A separate reviewer read every route, the secret flow, logs, export and erase. Its findings and
   what was done:
   - *High:* the breach runbook and the README told the owner to reset a profile by setting `secret_hash` to NULL, which reopens the claim
     to anyone polling with the shared token. **Fixed in the docs:** issue the person a new code instead
     ([docs/BREACH_RUNBOOK.md](docs/BREACH_RUNBOOK.md)); the recipe was checked end to end on the emulator.
   - *Medium:* with `REQUIRE_SECRET` on, a profile without a secret was left open and claimable. **Fixed:** it is locked, and claims are
     closed; the app tells the person to ask for a code.
   - *Medium:* care-team numbers (which reveal why a profile has no personal targets) were readable and writable with the shared token.
     **Fixed:** without the secret they are neither shown nor counted, and a profile with a secret changes its goals only with it.
   - *Low:* two oracles (the error code said whether a profile had a secret; the report said whether it had a health profile). **Fixed.**
   - *Low:* a failed Keychain write lost a just-created recovery code. **Fixed:** the code is shown anyway, with a warning.
   - *Low:* cleartext traffic allowed to any host in release builds. **Fixed:** only to this machine (and the app refuses a non-HTTPS
     server outside debug builds).
   - *Low:* a chunked request body was buffered whole before the size check. **Fixed:** the cap holds while it streams.
   - *Info:* error logs could carry a value quoted by D1. **Fixed:** quoted values are cut out of logged messages.
   - *Low, documented rather than changed:* day marks are read and written with the shared token (like the food log), and `POST /calls`
     returns the Vapi public key to any token holder (only `REQUIRE_SECRET` closes it). Both are in the README's *Notes and known limits*.
2. **Device pass: done** on the `Pixel_9_test` emulator with a release build, light and dark, at the default size and at **360 dp with
   1.3x font**: Today (the new "looks incomplete" prompt, amounts worth a check, grams), the Report for both reference sets (averages,
   trends, insights, energy, rows, four-week vitamins, what is missing, weight; no score card with the switch off), nutrient detail,
   Targets, the onboarding steps, the weigh-in and mark-this-day sheets, the food editor (raw or as eaten, its live warning, grams) and
   Foods with gaps. Fixed on the way: the chart's "Wed" breaking into two lines, "Get enough" squeezed into three lines by its hint,
   "target 2,600 / mg" splitting a number from its unit, the Today date truncated to "October 1…", energy figures more precise than a
   log can be (now to 10 kcal, as plan 7.6 asks), meal totals without thousands separators, the "make your targets personal" card shown
   on a report that was only locked, and calories still shown on Today with numbers hidden (low-pressure mode).
3. **A review packet for the human reviewers: done.** [docs/REVIEW_PACKET.md](docs/REVIEW_PACKET.md) holds ten personas on both
   reference sets, the gate matrix, the report's edges, both reference tables with their sources, every user-facing string and the data
   inventory, all generated from the code (`cd worker && npm run review:packet`), so it cannot drift from the app. Regenerate it after a
   change. It already shows things worth a reviewer's eye, for example that the India set offers weight loss from BMI 23.
4. **Found while building the packet: a loss or gain target was shown outside its own range** ("about 2,190 kcal (2,240 to 2,920)":
   the range was the steady-weight one). **Fixed in the engine:** the calorie target's range now moves with the goal, and a loss range
   never shows a low end under the calorie floor. The engine version is now **1.1.0**, so a profile's next save adds a new target set;
   weeks judged by an older set keep their old range until then.

## 3. Before you share it

- **Deploy order.** Run migrations **0002, 0003 and 0004** on the remote database (`npx wrangler d1 migrations apply nutrition-zero
  --remote`) before deploying this Worker, then rebuild the app (`react-native-keychain` is native, and the Android network security
  config changed). The deploy itself still needs `npx wrangler login`.
- **Switches** in `worker/wrangler.jsonc` are all **off**: `NUTRIENT_SCORE` (new: the score is not shown until the foods people eat have
  their mineral and sodium values), `SCORE_MODERATION`, `CALIBRATION`, `REQUIRE_SECRET`. The README says when to turn each on.
- **Stored target sets.** Sets saved before the India set carry no `shareRange`, so they fall back to the National Academies fat range, and
  the next profile save adds a new set because the engine's output now differs. That is expected.
- **Local test data** (only on this machine): the profiles "Asha 175144" (US set) and "Priya 175144" (India set) now have four weeks of
  food, a cooked-rice food with a katori conversion, and a recorded source on one food. Asha's secret was replaced with a code issued by
  the runbook recipe, which is in this session's scratchpad only; delete the local data with `rm -rf worker/.wrangler/state` if you like.

## 4. What changed in the second round (your four points)

1. **Incomplete data first.** Unchanged rules (unknown is never zero; a day is not logged, looks incomplete, or counts), now visible where
   the person can act: Today asks about a past day with very little logged, with one tap for "It is complete" or "Leave this day out".
2. **Food and portion accuracy.** Raw or as eaten on every food (migration 0004) with a question when a raw food is measured in a cooked
   helping; grams shown for household units; amounts worth a check (a likely mishearing) flagged on Today and in the report, and the voice
   assistant reads large amounts back. Source was already stored; "reliability" is shown as where the week's energy comes from (labels,
   databases, recipes, guesses, not recorded), not as a second made-up rating. No food values were invented.
3. **Four separate modules.** `targets/`, `intake/`, `quality/`, `report/` under `worker/src/domain/`, with a test that enforces which
   may import which.
4. **Insights before a score.** The report leads with the days that count, what was logged per day and how it compares with earlier
   weeks, what stood out, and what is missing. The Nutrient mix is off by default (`NUTRIENT_SCORE`) and comes last when it is on.

## 5. Choices worth a second look

- The amount-check edges (2,000 kcal in one item; 6 katoris or bowls, 4 plates, 8 cups or glasses, 30 pieces; 1.5 kg; 3 litres) are design
  choices, picked to be well past an ordinary helping. They only prompt, never reject.
- The India set keeps the National Academies **energy** equation (ICMR's per-kg energy path is not implemented).
- ICMR vitamin E uses 10 mg (the top of its 7.5 to 10 range) and fibre 15 g per 1,000 kcal; both are tagged as assumptions.
- "Foods with gaps" counts saturated fat and added sugars, the two newest nutrients, so at first nearly every food is listed. The card says
  which values are missing most often, so it reads as a to-do list rather than a verdict.
- The Hindi strings, ICMR protein range (still 10% to 35% of energy) and total sugars (no target) follow the plan's recommendations.

## 6. Left running on this machine

The `Pixel_9_test` emulator (light mode, normal density and font size), with your own release APK (`~/Downloads/NutritionTrackerZero.apk`)
installed again after the test builds. No local Worker is running.
