# Remaining work: iOS QA and the five requested changes (session of 2026-10-17)

Written when the session's tokens ran out. The older [REMAINING_WORK.md](REMAINING_WORK.md) is untouched. Pick this up by reading
"Resume here" first.

## Where things stand

| # | Request | Code | Automated tests | Checked in the iOS simulator | Android device | Deployed |
|---|---|---|---|---|---|---|
| 1 | Test the iOS app thoroughly and fix bugs | Not done as a systematic pass (see below) | | Only the screens I changed | | |
| 2 | "Call me again in N minutes" by voice | Done (Worker, app, Android + iOS native) | Done | **Not yet** (iOS native was changed but not rebuilt) | Kotlin compiles; instrumentation scenarios written, **not run** | No |
| 3 | Tap a nutrient to see the foods that add up to it | Done | Done | Today path checked (protein, vitamin A, edit sync); Report path **not** checked | Not checked | No |
| 4 | Temporarily remove complete / incomplete day | Done (one switch) | Done | Today shows no "Mark this day" | Not checked | No |
| 5 | My vs Global pending items | Done | Done | Checked (both sections, "You logged this") | Not checked | No |

Last full runs: app `tsc` clean, eslint 0 errors, **jest 66 suites / 1034 tests pass**; Worker **839 tests pass** (`npm test` in
`worker/`, `tsc` clean). A rare pre-existing flake: `profile.test.ts` "withholds every number in low-pressure mode" greps the response
for `2150|1910|2390`, which a random UUID can contain; it passed on rerun.

The two commits `b1dcd9e` and `f5f59f2` (not made by me) contain all of this work. My last two small fixes (the voice hook no longer
imports a UI component; three test mocks gained `useProfileTimeZone`) are uncommitted.

## Resume here (in this order)

1. **Rebuild iOS and test the call-back on the simulator.** `app/ios/habit_builder_app/NativeCallScheduler.swift` gained the
   `call-later` id, a "keep an unchanged one-shot" rule and custom notification words; it has never been compiled.
   Build: `cd app/ios && xcodebuild -workspace habit_builder_app.xcworkspace -scheme habit_builder_app -configuration Debug -destination 'platform=iOS Simulator,id=<UDID>' build`.
   Then: schedule a call back ~60-90 s ahead (a temporary debug button, or call `scheduleCallback({ minutes: 1 }, ...)` from a
   scratch screen), **terminate the app**, confirm the notification appears at the time with sound, tap it and confirm the call
   screen opens (kind `retry`). Also check: asking twice replaces the first; Cancel on Today removes it; relaunch keeps the card;
   simulator reboot keeps the pending notification; turning the daily call off removes it; sign-out removes it.
2. **iOS QA pass (request 1).** Nothing systematic was done beyond the audit in [docs/IOS_FLOW_QA.md](docs/IOS_FLOW_QA.md). To look at
   (unverified, may or may not be bugs):
   - Numeric keyboards (`decimal-pad`: edit-item quantity, amounts, weights, targets) have no Done key on iOS. The simulator hides the
     soft keyboard while a hardware keyboard is connected (I/O > Keyboard in DeviceHub), so this needs the soft keyboard on.
   - Registration: iOS shows its "Use Strong Password?" sheet and an email QuickType bar over the password field. Check the
     `textContentType`/`autoComplete` props on the auth fields.
   - The "+" button overlaps the Daily check-in toggle when Today is scrolled (check bottom padding).
   - Not exercised at all: Foods tab, Settings, Goals/Targets flows, onboarding permissions edge cases, dark mode, large Dynamic Type,
     iPhone 17e / iPad layouts, iOS 27 (iPhone 18 Pro), pull-to-refresh, back-swipe on every pushed screen, share/export.
   - Voice call UI cannot be tested with a microphone on the simulator; CallKit/PushKit paths are dormant (local notifications are used).
3. **Check the Report path on a device** for the breakdown: Report > Nutrient intake rows (day, week, month, year, custom), the
   "By day / By food" switch, a nutrient's detail screen link (week; four weeks for vitamins), numbers-hidden mode.
4. **Android emulator pass.** Run the instrumentation scenarios on an isolated `.remindertest` build (see
   [docs/REMINDER_DELIVERY.md](docs/REMINDER_DELIVERY.md)): `later`, `later-habit`, `later-replace`, `later-cancel` (added to
   `ScheduledCallInstrumentation.kt`; kill the process before the printed epoch and check `adb logcat -s NativeCallScheduler IncomingCallService`).
   `assembleDebugAndroidTest` was not compiled. Then check Today's call-back card, Reminder health's "Call back you asked for" row, and a
   reboot with a pending call back. Do not touch the other app on the Pixel_9_test AVD (see memory notes).
5. **Deploy, with the user's OK (free plan only).** The hosted app needs `cd worker && npm run deploy` for: the breakdown route,
   `mine` on `/uncached`, the `schedule_callback` tool and prompt, and the day-marking switch. **No migration was added.** Rebuild both
   apps afterwards (native scheduler changes on both platforms). Until then an updated app against the old Worker still works for
   Today's breakdown (built from the day) and shows only the global list on Pending.
6. **Docs.** Not updated yet: README API table (`GET /reports/breakdown`, `mine` on `/uncached`, 409 `day_marking_off`),
   `docs/VOICE_PROVIDERS.md` (the `schedule_callback` function), `docs/REMINDER_DELIVERY.md` (the `call-later` id on both platforms),
   PLAN.md section 13 (the call-back item is now built), and a short "feature switches" note.
7. **Review the diff with fresh eyes** (`/code-review`), and consider splitting the commits by feature.

## What was built, and the decisions to confirm

**4. Day completion off.** One switch: `FEATURES.dayCompletion` in `worker/src/domain/features.ts` (the app imports it through
`app/src/config/features.ts`). Off: no Mark-day row, sheet or "looks incomplete" card; the call does not ask and has no
`mark_day_complete` tool; `PUT/DELETE /days/:date/status` answer 409 `day_marking_off`; stored `day_status` rows are kept but no longer
read by any report or by `GET /days`; the "looks incomplete" insight is not offered; two labels were reworded. To restore: set it to
`true`, rebuild the app, redeploy. Tests that need marks flip it (`withDayCompletion` in `worker/test/features.ts`, `FEATURES` in app tests).
*Decision to confirm:* the rule that leaves a day with very little logged out of the weekly averages is a calculation, not a mark, so
it stays; a person can no longer override it.

**5. Pending.** `GET /uncached` keeps its top level (everyone's, most-logged first) and adds `mine` (what the asker logged, newest
first) when `X-User-Id` is sent, plus `myItemCount` on shared entries (shown as "You logged this"). The screen has "My pending items" then
"Global pending items"; "Foods with gaps" stays as its own list after both. *Decision to confirm:* the Pending tab badge now counts
the person's own items.

**3. Breakdown.** Pure builder `worker/src/domain/report/breakdown.ts` (the Worker route and the app share it); one day is built from
the day Today already has, a span comes from `GET /reports/breakdown?from&to&nutrient` (cap 5,000 items). Amounts are shown exactly
(up to two decimals) so they add up to the total; the total is written the way the dashboard writes it, with an extra line when the
dashboard rounds. Rows are editable (edit and delete refresh the list). Today's card has "All nutrients" for vitamins and minerals.

**2. Call back.** Tool `schedule_callback` with `minutes` (1 to 720) **or** `time` ("HH:MM", resolved on the phone in the profile's
time zone, daylight-saving safe); contract and limits in `worker/src/domain/callback.ts`. The phone arms a one-shot (`call-later`) through the same native
path as the daily call: Android exact alarm and full-screen ring; iOS a sound notification that starts the call when tapped (a local
notification cannot wake the app for CallKit, same as the daily reminder). The device is the source of truth (AsyncStorage record +
native persistence; `reconcile` puts it back after a force stop); no server record, no migration. Turning the daily call off removes it;
sign-out removes it. Live check against Deepgram's real model: "in 20 minutes", "in 10 minutes", "after 30 minutes", "in an hour",
"an hour and a half", "later... in 15 minutes", "at nine pm", "half past eight", "at 7 in the morning" all produced the right call.
"Habit reminders" do not exist in this app (only dormant native `habit-call` fields); the native scheduler relays any payload, and a habit
payload scenario is in the Android instrumentation. Vapi (the alternative provider) is handled by watching the call's tool messages;
it was not run live.

## How to bring the iOS test environment back (the helper scripts lived in the session scratchpad and are gone)

- Xcode 27 has no Simulator.app. Use `open /Applications/Xcode.app/Contents/Applications/DeviceHub.app`; AppleScript sees its window
  only while it is frontmost. Screenshots work headless: `xcrun simctl io booted screenshot out.png`. Taps need real mouse events
  (a small Swift CLI posting `CGEvent` clicks/drags); device points map to screen as x = 710 + 0.7388*px, y = 130 + 0.7388*py for the
  iPhone 17 Pro window at its default place. Use slow drags (about 45 steps) to scroll. Click the field before typing, or the letters
  trigger React Native's dev shortcuts.
- Isolated backend: `cd worker && npx wrangler d1 migrations apply nutrition-zero --local --persist-to <tmp-dir>`, then
  `npx wrangler dev --port 8787 --persist-to <tmp-dir>`; Metro `cd app && npx react-native start`.
- **Before testing, back up `app/src/config/local.ts` (git-ignored; it holds the production URL and token), point it at
  `http://localhost:8787` with the token from `worker/.dev.vars`, and restore it afterwards** (check the sha256).
  It is restored right now (checksum verified when I stopped).
- `worker/scripts/check-deepgram.mjs` shows how to run a live, no-write conversation with the agent (reads the key from `worker/.dev.vars`).

## Files that changed (main ones)

Worker: `domain/features.ts`, `domain/callback.ts`, `domain/report/breakdown.ts`, `routes/uncached.ts`, `routes/reports.ts`,
`routes/days.ts`, `vapi/prompt.ts`, `vapi/assistant.ts`, `vapi/webhook.ts`, `voice/conversation.ts`, `voice/routes.ts`,
`domain/report/insights.ts`, `domain/reference/scoring.ts`.
App: `config/features.ts`, `screens/NutrientBreakdownScreen.tsx`, `screens/UncachedScreen.tsx`, `screens/TodayScreen.tsx`,
`screens/VoiceCallScreen.tsx`, `components/today/{SummaryCard,CallbackCard,CheckinCard}.tsx`, `components/report/{RangeIntakeCard,NutrientDetail}.tsx`,
`hooks/{useNutrientBreakdown,usePendingCallback,useVoiceCall,useCallRouting}.ts`, `services/calls/{callback,callbackStore,reconcile,schedule,health,payload,triggers,native}.ts`,
`services/voice/providers/vapi.ts`, `utils/breakdown.ts`, `i18n/strings.ts`, `api/{client,types}.ts`.
Native: Android `NativeCallScheduler.kt` and `ScheduledCallInstrumentation.kt`; iOS `NativeCallScheduler.swift`.
New tests: worker `unit/{callback,breakdown}.test.ts`, `integration/{pending,breakdown,dayCompletionOff}.test.ts`, `features.ts`;
app `{pending,nutrientBreakdown,breakdownLinks,callback,callbackUi,dayCompletionOff}.test.ts(x)`, `embedded/breakdown.test.ts`.
