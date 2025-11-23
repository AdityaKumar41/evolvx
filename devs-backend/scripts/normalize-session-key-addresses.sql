-- Normalize all smartAccountAddress fields to lowercase for case-insensitive queries
-- This ensures consistency with the code which stores addresses in lowercase

UPDATE session_keys 
SET "smartAccountAddress" = LOWER("smartAccountAddress")
WHERE "smartAccountAddress" != LOWER("smartAccountAddress");

-- Verify the update
SELECT 
  COUNT(*) as total_session_keys,
  COUNT(DISTINCT "smartAccountAddress") as unique_addresses
FROM session_keys;
