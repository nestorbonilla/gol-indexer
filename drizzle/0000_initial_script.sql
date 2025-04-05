-- Drop the existing constraint first if it exists
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
	"timestamp" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lifeform_transfers_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "lifeform_tokens"("token_id") ON DELETE CASCADE
);
