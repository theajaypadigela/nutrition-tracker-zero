// Copy to local.ts (git-ignored) and fill in.
//
// ON_DEVICE = true: the whole backend runs inside the app on the phone's own SQLite file. Nothing to host, no account; API_BASE_URL
// stores meals locally. Deepgram still needs a hosted API_BASE_URL to mint temporary voice tokens (never put its key here).
// ON_DEVICE = false: talk to a Worker over HTTP. Local dev: run `adb reverse tcp:8787 tcp:8787` and keep http://localhost:8787.
export const ON_DEVICE = true;
export const API_BASE_URL = 'http://localhost:8787';
export const APP_TOKEN = 'dev-app-token-change-me';
