-- Create tables and constraints without trying to drop anything
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

-- Add unique constraint for token_id if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lifeform_tokens_token_id_unique'
  ) THEN
    ALTER TABLE "lifeform_tokens" ADD CONSTRAINT "lifeform_tokens_token_id_unique" UNIQUE("token_id");
  END IF;
END $$;

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

-- Add unique index to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "lifeform_transfers_unique_idx" 
ON "lifeform_transfers" ("token_id", "from_address", "to_address", "block_number", "transaction_hash");

-- Create the lifeform_moves table
CREATE TABLE IF NOT EXISTS "lifeform_moves" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" text NOT NULL,
	"caller_address" text NOT NULL,
	"block_number" bigint NOT NULL,
	"transaction_hash" text NOT NULL,
	"age" bigint NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now()
);

-- Add foreign key constraint for lifeform_moves if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lifeform_moves_token_id_fkey'
  ) THEN
    ALTER TABLE "lifeform_moves" ADD CONSTRAINT "lifeform_moves_token_id_fkey" 
    FOREIGN KEY ("token_id") REFERENCES "lifeform_tokens"("token_id") ON DELETE CASCADE;
  END IF;
END $$;

-- Function to get lifeform tokens with their latest transfers
CREATE OR REPLACE FUNCTION get_latest_transfers_for_tokens(
  pattern_type text,
  owner_address text DEFAULT NULL
)
RETURNS TABLE (
  _id UUID,
  age bigint,
  current_state text,
  is_alive boolean,
  is_dead boolean,
  is_loop boolean,
  is_still boolean,
  owner text,
  sequence_length bigint,
  token_id text,
  latest_block_number bigint,
  latest_transaction_hash text
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_transfers AS (
    SELECT 
      lt.token_id,
      lt.block_number,
      lt.transaction_hash,
      ROW_NUMBER() OVER (PARTITION BY lt.token_id ORDER BY lt.block_number DESC) AS rn
    FROM lifeform_transfers lt
  ),
  filtered_tokens AS (
    SELECT *
    FROM lifeform_tokens t
    WHERE 
      (pattern_type = 'all') OR
      (pattern_type = 'still' AND t.is_still = TRUE) OR
      (pattern_type = 'loop' AND t.is_loop = TRUE AND t.is_still = FALSE) OR
      (pattern_type = 'path' AND t.is_still = FALSE AND t.is_loop = FALSE)
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

-- Check if the supabase_realtime publication exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    -- Create the publication if it doesn't exist
    EXECUTE 'CREATE PUBLICATION supabase_realtime';
  END IF;
END
$$;

-- Enable real-time updates for lifeform_tokens table
ALTER PUBLICATION supabase_realtime ADD TABLE lifeform_tokens; 