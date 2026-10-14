# Breach runbook

One page, for the owner of the deployment. It exists because the app stores body measurements (WEEKLY_BREAKDOWN_PLAN.md 8.3.6). Read
it once now, not during an incident. Nothing here is legal advice; whether a breach must be reported depends on where the people
affected live (the plan's 8.3.5 lists the rules to check with a lawyer).

## What counts

Anything that let someone who should not have it read or change a person's data: the shared `APP_TOKEN` leaked or extracted from an
APK and used, an account credential exposed, a Cloudflare or Vapi credential exposed, a log or export shared by mistake,
or a lost phone with the app signed in. A **disclosure** counts even if no one hacked anything (the US Health Breach Notification Rule
treats it as a breach).

## First hour

1. **Decide who is in charge.** One person. Write down the time you learned of it and what you know. Do not delete evidence.
2. **Stop the access.**
   - Shared token leaked or extracted:
     ```sh
     cd worker
     openssl rand -base64 32 | tr -d '\n' | tee /dev/tty | npx wrangler secret put APP_TOKEN   # new token, printed once
     ```
     Put it in `app/src/config/local.ts` and **ship a new APK**: the token is compiled into the app, so every friend must update. Until
     they do, the old app gets 401s. Body measurements stay protected by the per-profile secrets meanwhile.
   - One account's credential exposed: revoke its login sessions and invalidate the old installation credential. Never set
     `secret_hash` to NULL: the legacy `POST /me/secret` claim remains available for compatibility.
     ```sh
     cd worker
     npx wrangler d1 execute nutrition-zero --remote --command "DELETE FROM account_sessions WHERE user_id = '<profile id>'; UPDATE users SET secret_hash = lower(hex(randomblob(32))) WHERE id = '<profile id>'"
     ```
     Saved health data is unchanged. The person selects **Log in again** and uses their account password to restore access.
     If the password itself was exposed, revoking credentials alone is insufficient: the deployment owner must also replace
     `password_hash` using the application's password-hashing function. There is no in-app password-reset flow.
   - Make every profile route need the secret from now on: set `REQUIRE_SECRET` to `"1"` in `worker/wrangler.jsonc` and deploy.
   - Vapi key exposed: the person revokes it in their Vapi dashboard and pastes a new public key in Settings.
   - Cloudflare account access exposed: rotate the API token and the account password, review the audit log.
3. **Find out what was reached.** Workers Logs hold request lines (no bodies, no profile fields: that is tested), so they show which
   routes were called with which ids. D1 holds no access log; Time Travel (7 days Free, 30 Paid) can restore a past state.

   ```sh
   npx wrangler d1 time-travel info nutrition-zero          # the restorable window
   ```
4. **Contain data that is out.** If an export or a screenshot was shared, ask for it to be deleted and record that you asked.

## Who to tell, and when

| Who | When | What to say |
|---|---|---|
| The people affected | As soon as you know whose data it was | What was reachable (food log, call transcripts, height, weight, targets), when, what you did, what they should do (log in again after credential revocation; revoke the Vapi key if it was exposed) |
| India's Data Protection Board | If the DPDP Act duties are in force and apply to you (the core duties start on **13 May 2027**); the Rules ask for notice within **72 hours** of becoming aware, with a fuller report after | What happened, when, what data, steps taken. Check with a lawyer whether an app shared with friends is inside the Act |
| The US Federal Trade Commission, and the people affected | If US consumers' data was disclosed and the Health Breach Notification Rule applies: within **60 days** (sooner for a large breach) | The same facts |
| EU / UK regulator | Only if the app was offered to people there (GDPR Art 33: 72 hours) | Not targeted by design |

## After

- Write down what happened, what you changed and why. Put it where you will find it.
- Turn on `REQUIRE_SECRET` if it was not already on. With it on, a profile that still has no secret is locked rather than open, and
  cannot claim one through the legacy endpoint. Password accounts can log in to obtain a credential automatically.
- Re-run the privacy tests (`cd worker && npm test`): the canary scans must still pass.
- Rotate anything that was exposed even if you are not sure it was used.

## Things that are always true

- The Worker stores only a SHA-256 of each account credential; it cannot retrieve existing credentials. Password login grants a new one.
- `DELETE /me` erases a person's data now and from backups within the Time Travel window; say "within 30 days" on the Free plan's 7-day window or the Paid plan's 30 days.
- The voice call goes to Vapi and the providers it uses; their retention is each friend's own account setting (recommend Zero Data Retention).
