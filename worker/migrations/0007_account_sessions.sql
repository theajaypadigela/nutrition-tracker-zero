-- Password login grants access to the account's existing data without replacing credentials on other phones.
-- Only the hash is stored; the app keeps the token in Keychain / Keystore, as it does for existing credentials.
CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX account_sessions_user ON account_sessions(user_id);
