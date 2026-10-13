-- Personalised targets (WEEKLY_BREAKDOWN_PLAN.md section 9.1, Phase 2).
-- D1 runs each migration file in a transaction; no BEGIN/COMMIT here. Nothing below touches existing rows.

-- 1. Access control for health data: a per-profile secret. Only its SHA-256 is stored; the 32-byte token is
--    shown once at creation and kept in the phone's secure storage (section 8.3.2).
ALTER TABLE users ADD COLUMN secret_hash TEXT;

-- 2. What the person told us. Only fields that change a number or a message. A user without a row keeps
--    today's behaviour (generic mode). A 'reference_only' row stores NO body or goal data (nothing is kept
--    about someone who is under 19, pregnant, has an eating-disorder history, or follows a clinician's diet;
--    and not which of those it was, section 8.1); a 'personalised' row must have every body and goal field.
CREATE TABLE health_profiles (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_mode     TEXT NOT NULL CHECK (target_mode IN ('personalised', 'reference_only')),
  birth_year      INTEGER CHECK (birth_year BETWEEN 1900 AND 2100),
  birth_month     INTEGER CHECK (birth_month BETWEEN 1 AND 12),                    -- optional: tightens age-band edges
  sex_for_calc    TEXT CHECK (sex_for_calc IN ('female', 'male', 'average')),      -- equation selector, not an identity
  height_cm       REAL CHECK (height_cm BETWEEN 120 AND 230),
  activity_level  TEXT CHECK (activity_level IN ('inactive', 'low_active', 'active', 'very_active')),
  goal            TEXT CHECK (goal IN ('general_health', 'maintain', 'lose', 'gain', 'build_muscle')),
  pace            TEXT NOT NULL DEFAULT 'standard' CHECK (pace IN ('gentle', 'standard', 'faster')),  -- lose / gain only
  diet_pattern    TEXT NOT NULL DEFAULT 'omnivore'
                  CHECK (diet_pattern IN ('omnivore', 'eggetarian', 'vegetarian', 'vegan', 'pescatarian')),
  reference_set   TEXT NOT NULL DEFAULT 'nasem' CHECK (reference_set IN ('nasem', 'icmr_nin')),
  diet_interacting_medicine INTEGER NOT NULL DEFAULT 0 CHECK (diet_interacting_medicine IN (0, 1)),  -- turns off K, potassium, sodium verdicts
  numbers_hidden  INTEGER NOT NULL DEFAULT 0 CHECK (numbers_hidden IN (0, 1)),     -- low-pressure display (section 8.2)
  consent_version TEXT NOT NULL,
  consented_at    TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (target_mode = 'reference_only'
         OR (birth_year IS NOT NULL AND sex_for_calc IS NOT NULL AND height_cm IS NOT NULL
             AND activity_level IS NOT NULL AND goal IS NOT NULL))
);

-- 3. Weigh-ins. One per day; the latest one feeds the energy estimate, the series feeds the trend.
CREATE TABLE weight_entries (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date  TEXT NOT NULL,
  weight_kg   REAL NOT NULL CHECK (weight_kg BETWEEN 25 AND 350),
  created_at  TEXT NOT NULL,
  UNIQUE (user_id, local_date)
);

-- 4. Immutable versions of the computed targets (personalised profiles only). A day is judged against the
--    set in force on that day, so changing weight or goal never rewrites last month's report.
CREATE TABLE target_sets (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from  TEXT NOT NULL,        -- 'YYYY-MM-DD' in the user's time zone
  engine_version  TEXT NOT NULL,        -- which formulas produced it, e.g. '1.0.0'
  reference_set   TEXT NOT NULL,
  inputs_json     TEXT NOT NULL,        -- the inputs exactly as used (age band, sex_for_calc, height, weight, activity, goal, pace, pattern)
  targets_json    TEXT NOT NULL,        -- the Target[] the report used, with the energy estimate and the warnings
  created_at      TEXT NOT NULL
);
CREATE INDEX target_sets_user_from ON target_sets (user_id, effective_from);

-- 5. "This day is complete / partial / leave it out of my reports" (illness, travel, fasting, festival).
CREATE TABLE day_status (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date  TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'skip')),
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, local_date)
);

-- 6. Custom goals keep working as overrides of the recommended value. Remember when they were set, and
--    whether the person typed them or took them from their care team (section 6.7).
ALTER TABLE user_goals ADD COLUMN updated_at TEXT;
ALTER TABLE user_goals ADD COLUMN origin TEXT NOT NULL DEFAULT 'custom' CHECK (origin IN ('custom', 'care_team'));
