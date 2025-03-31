--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lifeform_tokens" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_number" bigint,
	"transaction_hash" text,
	"owner" text,
	"token_id" text,
	"is_loop" boolean,
	"is_still" boolean,
	"is_alive" boolean,
	"is_dead" boolean,
	"sequence_length" bigint,
	"current_state" text,
	"age" bigint
);
