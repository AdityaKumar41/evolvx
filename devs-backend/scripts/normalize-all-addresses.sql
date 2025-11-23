-- Normalize all Ethereum addresses to lowercase for case-insensitive queries
-- This ensures consistency with the code which stores addresses in lowercase

-- 1. Normalize smart account addresses in users table
UPDATE users 
SET "smartAccountAddress" = LOWER("smartAccountAddress")
WHERE "smartAccountAddress" IS NOT NULL 
  AND "smartAccountAddress" != LOWER("smartAccountAddress");

-- 2. Normalize wallet addresses in users table
UPDATE users 
SET "walletAddress" = LOWER("walletAddress")
WHERE "walletAddress" IS NOT NULL 
  AND "walletAddress" != LOWER("walletAddress");

-- 3. Normalize wallet addresses in wallets table
UPDATE wallets 
SET "walletAddress" = LOWER("walletAddress")
WHERE "walletAddress" != LOWER("walletAddress");

-- 4. Normalize smart account addresses in session_keys table
UPDATE session_keys 
SET "smartAccountAddress" = LOWER("smartAccountAddress")
WHERE "smartAccountAddress" != LOWER("smartAccountAddress");

-- 5. Normalize any other address fields (add as needed)
-- UPDATE escrow_pools SET "contractAddress" = LOWER("contractAddress") WHERE ...;
-- UPDATE projects SET "tokenAddress" = LOWER("tokenAddress") WHERE ...;

-- Verify the updates
SELECT 
  'users' as table_name,
  COUNT(*) as total_smart_accounts,
  COUNT(DISTINCT "smartAccountAddress") as unique_addresses
FROM users 
WHERE "smartAccountAddress" IS NOT NULL

UNION ALL

SELECT 
  'session_keys' as table_name,
  COUNT(*) as total_session_keys,
  COUNT(DISTINCT "smartAccountAddress") as unique_addresses
FROM session_keys

UNION ALL

SELECT 
  'wallets' as table_name,
  COUNT(*) as total_wallets,
  COUNT(DISTINCT "walletAddress") as unique_addresses
FROM wallets;
