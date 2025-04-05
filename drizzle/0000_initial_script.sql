-- We need to drop the foreign key constraint first if it exists
ALTER TABLE IF EXISTS "lifeform_transfers" DROP CONSTRAINT IF EXISTS "lifeform_transfers_token_id_fkey";

-- Now we can safely drop the unique constraint
ALTER TABLE IF EXISTS "lifeform_tokens" DROP CONSTRAINT IF EXISTS "lifeform_tokens_token_id_unique";

CREATE TABLE IF NOT EXISTS "lifeform_tokens" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" text NOT NULL,
	"owner" text NOT NULL,
	"is_loop" boolean,
	"is_still" boolean,
	"is_alive" boolean,
	"is_dead" boolean,
	"sequence_length" bigint,
	"current_state" text,
	"age" bigint
);

-- Add unique constraint for token_id
ALTER TABLE "lifeform_tokens" ADD CONSTRAINT "lifeform_tokens_token_id_unique" UNIQUE("token_id");

CREATE TABLE IF NOT EXISTS "lifeform_transfers" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"block_number" bigint NOT NULL,
	"transaction_hash" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now()
);

-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lifeform_transfers_token_id_fkey'
  ) THEN
    ALTER TABLE "lifeform_transfers" ADD CONSTRAINT "lifeform_transfers_token_id_fkey" 
    FOREIGN KEY ("token_id") REFERENCES "lifeform_tokens"("token_id") ON DELETE CASCADE;
  END IF;
END $$;

-- Drop the function if it exists
DROP FUNCTION IF EXISTS get_latest_transfers_for_tokens(TEXT, TEXT);

-- Function to get lifeform tokens with their latest transfers
CREATE OR REPLACE FUNCTION get_latest_transfers_for_tokens(
  pattern_type TEXT,
  owner_address TEXT DEFAULT NULL
)
RETURNS TABLE (
  _id UUID,
  age INTEGER,
  current_state TEXT,
  is_alive BOOLEAN,
  is_dead BOOLEAN,
  is_loop BOOLEAN,
  is_still BOOLEAN,
  owner TEXT,
  sequence_length INTEGER,
  token_id TEXT,
  latest_block_number INTEGER,
  latest_transaction_hash TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_transfers AS (
    SELECT 
      token_id,
      block_number,
      transaction_hash,
      ROW_NUMBER() OVER (PARTITION BY token_id ORDER BY block_number DESC) AS rn
    FROM lifeform_transfers
  ),
  filtered_tokens AS (
    SELECT *
    FROM lifeform_tokens
    WHERE 
      (pattern_type = 'all') OR
      (pattern_type = 'still' AND is_still = TRUE) OR
      (pattern_type = 'loop' AND is_loop = TRUE AND is_still = FALSE) OR
      (pattern_type = 'path' AND is_still = FALSE AND is_loop = FALSE)
  )
  SELECT 
    t._id,
    t.age,
    t.current_state,
    t.is_alive,
    t.is_dead,
    t.is_loop,
    t.is_still,
    t.owner,
    t.sequence_length,
    t.token_id,
    lt.block_number AS latest_block_number,
    lt.transaction_hash AS latest_transaction_hash
  FROM filtered_tokens t
  LEFT JOIN latest_transfers lt ON t.token_id = lt.token_id AND lt.rn = 1
  WHERE 
    (owner_address IS NULL) OR 
    (t.owner = owner_address)
  ORDER BY 
    COALESCE(lt.block_number, 0) DESC,
    t.token_id
  LIMIT CASE WHEN owner_address IS NULL THEN 100 ELSE NULL END;
END;
$$ LANGUAGE plpgsql; 