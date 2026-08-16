-- Substrate volume, so a dose can be sized against the pot rather than against
-- a single hard-coded number that is too little for a large pot and a flood
-- for a small one.
--
-- Nullable on purpose: pots created before this migration were never asked how
-- big they are, and inventing a default would silently claim knowledge we do
-- not have. A NULL means "unknown" and callers must fall back to the smallest
-- safe dose — under-watering is recoverable at the next cycle, over-watering
-- is not.
ALTER TABLE pot ADD COLUMN substrate_volume_ml INTEGER;
