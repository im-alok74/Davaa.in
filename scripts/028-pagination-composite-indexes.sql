-- Composite indexes backing the LIMIT/OFFSET pagination added to the distributor,
-- pharmacy-medicines and pharmacy-inventory listing endpoints. Each of those queries
-- filters by the owner id and orders by a timestamp column; without a matching
-- composite index, Postgres has to sort every one of that owner's rows before it can
-- apply LIMIT — measured at ~23k rows for the largest distributor account.
--
-- Already applied directly to production with CREATE INDEX CONCURRENTLY (this file
-- uses the plain, non-concurrent form so it can run inside this runner's transaction
-- wrapper; IF NOT EXISTS makes it a no-op there, and a fresh environment gets a normal,
-- briefly-locking create on what would be an empty/small table anyway).

CREATE INDEX IF NOT EXISTS idx_distributor_medicines_dist_created
  ON distributor_medicines (distributor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pharmacy_medicines_pharmacy_created
  ON pharmacy_medicines (pharmacy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pharmacy_inventory_pharmacy_updated
  ON pharmacy_inventory (pharmacy_id, last_updated DESC);
