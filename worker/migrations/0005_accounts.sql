-- Accounts: a username and a password. D1 runs each migration file in a transaction; no BEGIN/COMMIT here.
-- The username is the existing users.name, which is already unique and case-insensitive. password_hash is how POST /auth/register stores
-- the password (PBKDF2, see auth.ts), never the password itself. Nullable: a profile made before accounts existed has no password, and
-- nothing below touches existing rows. Such a profile cannot log in until it has one.
ALTER TABLE users ADD COLUMN password_hash TEXT;
