-- WEEKLY_BREAKDOWN_PLAN.md section 9.1, Phase 4. D1 runs each migration file in a transaction; no BEGIN/COMMIT here.
-- Nutrients the guidelines weight most and the app could not see (first wave), and where a food's numbers came from.
-- All nullable: null still means "unknown", never zero. Nothing below touches existing rows.
ALTER TABLE foods ADD COLUMN saturated_fat_g REAL;
ALTER TABLE foods ADD COLUMN added_sugar_g   REAL;
ALTER TABLE foods ADD COLUMN vitamin_b12_mcg REAL;
ALTER TABLE foods ADD COLUMN folate_mcg      REAL;
-- Where the numbers came from: a pack label, a food composition database, a recipe worked out by the person, or a guess.
ALTER TABLE foods ADD COLUMN source TEXT CHECK (source IS NULL OR source IN ('label', 'database', 'recipe', 'estimate'));
-- When someone last reviewed the numbers (set on every save through the API that carries values or a source).
ALTER TABLE foods ADD COLUMN reviewed_at TEXT;
