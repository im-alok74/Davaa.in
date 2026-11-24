ALTER TABLE medicine_out_of_stock_requests
  ALTER COLUMN pharmacy_id DROP NOT NULL,
  ALTER COLUMN distributor_id DROP NOT NULL,
  ALTER COLUMN distributor_medicine_id DROP NOT NULL;

ALTER TABLE medicine_out_of_stock_requests
  ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS accept_substitute BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_out_of_stock_requests_customer
  ON medicine_out_of_stock_requests(customer_id);
