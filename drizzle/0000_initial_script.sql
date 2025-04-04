-- Drop the existing constraint first if it exists
ALTER TABLE IF EXISTS "lifeform_tokens" DROP CONSTRAINT IF EXISTS "lifeform_tokens_token_id_unique";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lifeform_tokens" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" text UNIQUE NOT NULL,
	"owner" text NOT NULL,
	"is_loop" boolean,
	"is_still" boolean,
	"is_alive" boolean,
	"is_dead" boolean,
	"sequence_length" bigint,
	"current_state" text,
	"age" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lifeform_transfers" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"block_number" bigint NOT NULL,
	"transaction_hash" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
