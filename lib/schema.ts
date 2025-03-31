import { bigint, pgTable, text, uuid, boolean } from "drizzle-orm/pg-core";

export const lifeformTokens = pgTable("lifeform_tokens", {
  _id: uuid("_id").primaryKey().defaultRandom(),
  block_number: bigint("block_number", { mode: "number" }),
  transaction_hash: text("transaction_hash"),
  owner: text("owner"),
  token_id: text("token_id"),
  is_loop: boolean("is_loop"),
  is_still: boolean("is_still"),
  is_alive: boolean("is_alive"),
  is_dead: boolean("is_dead"),
  sequence_length: bigint("sequence_length", { mode: "number" }),
  current_state: text("current_state"),
  age: bigint("age", { mode: "number" }),
});
