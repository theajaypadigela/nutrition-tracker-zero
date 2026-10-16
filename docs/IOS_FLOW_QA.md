# iOS flow audit — 16 October 2026

Built and ran the React Native app on iPhone 17 Pro / iOS 26.5. Also ran it on iPhone 18 Pro / iOS 27.0 to verify startup and a failing profile request. Existing report and native iOS workspace changes were preserved.

Tests used a separate local Worker database at `/tmp/ntz-ios-test-db` and disposable accounts. No production data was created or modified. The original app configuration was restored after testing.

## Fixes

| Issue | Result |
|---|---|
| Unknown daily and meal nutrition appeared as zero; partial daily figures looked complete | Unknown totals now read as unknown; partial figures carry lower bounds and remaining energy is labelled as an upper bound. Empty days still show zero. Food-library entries with unknown energy no longer claim zero calories. |
| Editing amounts and unit conversions rejected decimal commas accepted by food logging | Both use the same numeric reader as food logging; ambiguous thousands/decimal forms remain rejected. |
| Date changes could retain another date's results, including after a failed fetch | Shared async state keeps values for refreshes of the same inputs and clears them for changed inputs. Late responses are ignored. Navigation reload callbacks remain stable. |
| A failed food-editor load could fall through to creating a new food | The editor now shows Retry and disables saving until the existing food loads. |
| The iOS settings time spinner saved every movement and had no completion control | Time changes remain a draft until Save; Cancel discards them. The picker closes after a successful save. |
| Notification setup showed Done after denial or a permission-check failure | Done now requires authorization; denied and failed checks have separate messages. |
| iOS reminder wording promised Android-style full-screen ringing and retries | iOS descriptions now explain the actual sound-notification and tap-to-start behavior. |
| Today kept an old reminder time after returning from Settings | Reminder settings reload when Today regains focus. |
| The Foods list displayed calories with Hide numbers enabled | Food rows now show their serving basis without calorie figures in that mode. |
| A failed health-profile request crashed on the iOS runtime with `Property 'e' doesn't exist` | The error message is captured before the deferred React state update. Rechecked on iOS 27: the app displays an error and stays usable. |
| Closing during initial account setup discarded onboarding | Pending onboarding is persisted separately for each account and cleared only when setup finishes. Verified restoration using an unfinished-setup fixture on the simulator. |

## Flow coverage

| Flow | Verification |
|---|---|
| Login, secure session restoration, logout, registration, show/hide password | Exercised in the iOS UI using disposable local accounts. |
| Initial call setup, cold-launch restoration, completion | Exercised in the iOS UI; authorization/denial/failure states also covered by regression tests. |
| Adding foods across meals, editing quantities, pending foods, entering shared nutritional values, resolution of past logs | Exercised in the iOS UI. Decimal handling and failed edit loads have regression tests. |
| Daily, weekly, monthly, yearly, custom reports; totals/averages; nutrient expansion | Exercised in the iOS UI with known and unknown foods. |
| Day marking | Opened options and marked a disposable day as skipped; API status transitions are also tested. |
| Personal-target setup | Exercised consent, safety check, body details with synthetic values, activity, goal, diet/reference selection, preview and save. Confirmed the saved target on Today. |
| Custom daily targets | Saved a custom protein target and confirmed it on Today. |
| System/dark appearance and Hide numbers | Exercised in the UI. Checked Today, Report, Settings and the food library. |
| Reminder time and reminder health | Saved an iOS time, confirmed Today updates, and checked the permission diagnostics. |
| Profile API failure | Exercised on iOS 27; confirmed recovery from the crash. |

## Validation

- iOS Debug build: successful with normal simulator signing. Disabling signing prevents Keychain access and is unsuitable for authentication checks.
- App: **59 suites, 927 tests passed**, including 22 added regression cases.
- Worker: **48 suites, 757 tests passed**.
- App TypeScript: passed.
- ESLint: no errors; three existing warnings in generated/unchanged files.
- `git diff --check`: passed.

Commands: `cd app && npm run typecheck && npm run lint && npm test -- --runInBand`; `cd worker && npm test`.

## Remaining verification limits

Live provider calls, real microphone/audio quality, Bluetooth/earpiece routing, proximity behavior and locked-phone reminder delivery were not tested on a physical iPhone. Provider, lifecycle, scheduling and backend automated tests passed, but these do not replace hardware testing. Native OS password prompts also limit automated interaction with parts of registration; the account was created successfully and onboarding was checked after relaunch with a test fixture. Export/share and irreversible account-erasure UI flows were not manually executed.

This audit fixes the issues found in this pass; it is not a guarantee that every possible device or input combination is bug-free.
