CREATE TABLE IF NOT EXISTS "lifeform_transfers" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"block_number" bigint NOT NULL,
	"transaction_hash" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "lifeform_tokens" ALTER COLUMN "owner" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lifeform_tokens" ALTER COLUMN "token_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lifeform_tokens" DROP COLUMN IF EXISTS "block_number";--> statement-breakpoint
ALTER TABLE "lifeform_tokens" DROP COLUMN IF EXISTS "transaction_hash";--> statement-breakpoint
ALTER TABLE "lifeform_tokens" ADD CONSTRAINT "lifeform_tokens_token_id_unique" UNIQUE("token_id");