-- Nutrition Tracker Zero: initial schema (PLAN.md §6).
-- D1 runs each migration file in a transaction; no BEGIN/COMMIT here.

CREATE TABLE users (
  id              TEXT PRIMARY KEY,                    -- uuid
  name            TEXT NOT NULL COLLATE NOCASE UNIQUE, -- profile picker after reinstall
  timezone        TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  call_time       TEXT,                                -- 'HH:MM' local, NULL = not set
  call_enabled    INTEGER NOT NULL DEFAULT 1,
  vapi_public_key TEXT,                                -- never returned by settings endpoints
  webhook_token   TEXT NOT NULL UNIQUE,                -- 32 random bytes, base64url
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE calls (
  id            INTEGER PRIMARY KEY,                   -- exists before Vapi assigns an id
  vapi_call_id  TEXT UNIQUE,
  user_id       TEXT NOT NULL REFERENCES users(id),
  local_date    TEXT NOT NULL,                         -- 'YYYY-MM-DD' in the user's timezone
  kind          TEXT NOT NULL CHECK (kind IN ('scheduled','retry','test','manual','unknown')),
  status        TEXT NOT NULL CHECK (status IN ('queued','called','tool_saved','no_list','failed')),
  ended_reason  TEXT,
  transcript    TEXT,
  duration_seconds REAL,
  error         TEXT,
  processed_tool_call_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of {id, n}, dedupe
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX calls_user_date ON calls(user_id, local_date);

CREATE TABLE foods (                                    -- SHARED cache, values entered by people only
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,                   -- canonical normalized name
  display_name  TEXT NOT NULL,
  base_unit     TEXT NOT NULL,                          -- one of BASE_UNITS
  calories      REAL NOT NULL,                          -- per ONE base serving
  protein_g REAL, carbs_g REAL, fat_g REAL, fiber_g REAL, sugar_g REAL, sodium_mg REAL,
  vitamin_a_mcg REAL, vitamin_c_mg REAL, vitamin_d_mcg REAL, vitamin_e_mg REAL, vitamin_k_mcg REAL,
  calcium_mg REAL, iron_mg REAL, potassium_mg REAL, magnesium_mg REAL, zinc_mg REAL,
  added_by      TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE food_aliases (
  alias      TEXT PRIMARY KEY,                          -- normalized; one alias -> one food
  food_id    TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  added_by   TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE food_units (                               -- 1 <unit> = servings x base serving
  food_id    TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  unit       TEXT NOT NULL,
  servings   REAL NOT NULL CHECK (servings > 0),
  added_by   TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (food_id, unit)
);

CREATE TABLE log_items (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  local_date      TEXT NOT NULL,
  meal            TEXT CHECK (meal IN ('breakfast','lunch','snack','dinner')),
  raw_name        TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity        REAL NOT NULL CHECK (quantity > 0),
  unit            TEXT NOT NULL,
  food_id         TEXT REFERENCES foods(id),
  status          TEXT NOT NULL CHECK (status IN ('resolved','pending_food','pending_unit')),
  call_id         TEXT,                                 -- vapi_call_id, NULL for manual
  source          TEXT NOT NULL CHECK (source IN ('call','manual','import')),
  created_at      TEXT NOT NULL
);
CREATE INDEX log_items_user_date ON log_items(user_id, local_date);
CREATE INDEX log_items_pending   ON log_items(status, normalized_name) WHERE status <> 'resolved';
CREATE INDEX log_items_food      ON log_items(food_id);
CREATE INDEX log_items_call      ON log_items(call_id);

CREATE TABLE user_goals (                               -- custom daily nutrient targets
  user_id  TEXT NOT NULL REFERENCES users(id),
  nutrient TEXT NOT NULL,
  target   REAL NOT NULL,
  PRIMARY KEY (user_id, nutrient)
);
