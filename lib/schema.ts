import { bigint, pgTable, text, uuid, boolean, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const lifeformTokens = pgTable("lifeform_tokens", {
  _id: uuid("_id").primaryKey().defaultRandom(),
  token_id: text("token_id").unique().notNull(),
  owner: text("owner").notNull(),
  is_loop: boolean("is_loop"),
  is_still: boolean("is_still"),
  is_alive: boolean("is_alive"),
  is_dead: boolean("is_dead"),
  sequence_length: bigint("sequence_length", { mode: "number" }),
  current_state: text("current_state"),
  age: bigint("age", { mode: "number" }),
});

export const lifeformTransfers = pgTable("lifeform_transfers", {
  _id: uuid("_id").primaryKey().defaultRandom(),
  token_id: text("token_id").notNull(),
  from_address: text("from_address").notNull(),
  to_address: text("to_address").notNull(),
  block_number: integer("block_number").notNull(),
  transaction_hash: text("transaction_hash").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => {
  return {
    uniqueTransferIdx: uniqueIndex("lifeform_transfers_unique_idx").on(
      table.token_id,
      table.from_address,
      table.to_address,
      table.block_number,
      table.transaction_hash
    ),
  };
});

export const lifeformMoves = pgTable("lifeform_moves", {
  _id: uuid("_id").primaryKey().defaultRandom(),
  token_id: text("token_id").notNull(),
  caller_address: text("caller_address").notNull(),
  block_number: bigint("block_number", { mode: "number" }).notNull(),
  transaction_hash: text("transaction_hash").notNull(),
  age: bigint("age", { mode: "number" }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
});
