-- Raw or as eaten (WEEKLY_BREAKDOWN_PLAN.md 7.4, 7.7). D1 runs each migration file in a transaction; no BEGIN/COMMIT here.
-- What a food's numbers describe: the food as it is eaten (cooked, or eaten as it is: idli, dal, fruit, milk, biscuits), or the food
-- raw or dry, before cooking (rice or dal from the pack, atta, raw chicken). 100 g of dry rice has about three times the energy of
-- 100 g of cooked rice, so a food entered from a pack of dry rice and logged by the katori is the commonest way for a portion to be
-- wrong. Nullable: null means nobody said, and nothing below touches existing rows.
ALTER TABLE foods ADD COLUMN form TEXT CHECK (form IS NULL OR form IN ('as_eaten', 'raw'));
