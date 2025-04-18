import { defineIndexer } from "@apibara/indexer";
import { drizzleStorage, useDrizzleStorage, drizzle } from "@apibara/plugin-drizzle";
import { getSelector, StarknetStream, decodeEvent } from "@apibara/starknet";
import { lifeformTokens, lifeformTransfers } from "@/lib/schema";
import { useLogger } from "@apibara/indexer/plugins";
import type { ApibaraRuntimeConfig } from "apibara/types";
import { eq, sql } from "drizzle-orm";
import { lifeformAbi } from "@/lib/abi";

// Helper function to normalize addresses to a consistent format
function normalizeAddress(address: string): string {
  // If it's the zero address in any format, return the full format
  if (address === "0x0" || address === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
  // If it's a shortened address (less than 66 chars), pad it
  if (address.startsWith("0x") && address.length < 66) {
    return address.padEnd(66, "0");
  }
  return address;
}

const CONTRACT_ADDRESS = "0x448dfacea7f273f5fed897a56bc62bf57a86f4def23197172c222d3e2c266c1";
const NEW_LIFEFORM_SELECTOR = getSelector("NewLifeForm");
const TRANSFER_SELECTOR = getSelector("Transfer");
const NEW_MOVE_SELECTOR = getSelector("NewMove");

console.log("Contract address:", CONTRACT_ADDRESS);
console.log("New lifeform selector:", NEW_LIFEFORM_SELECTOR);
console.log("Transfer selector:", TRANSFER_SELECTOR);
console.log("New move selector:", NEW_MOVE_SELECTOR);

// Lifeform tokens on Starknet Sepolia
export default function (runtimeConfig: ApibaraRuntimeConfig) {
  const {
    starknet: { startingBlock, streamUrl },
  } = runtimeConfig as { starknet: { startingBlock: number; streamUrl: string } };

  // Create a single database connection
  const database = drizzle({
    schema: {
      lifeformTokens,
      lifeformTransfers,
    },
  });

  console.log(`Starting block: ${startingBlock} at ${streamUrl}`);

  return defineIndexer(StarknetStream)({
    streamUrl,
    finality: "accepted",
    startingBlock: BigInt(startingBlock),
    debug: true,
    plugins: [
      drizzleStorage({
        db: database,
        idColumn: {
          "*": "_id",
        },
        persistState: false, // Set to false to process all historical events from the starting block
        indexerName: "lifeform_tokens",
        migrate: {
          migrationsFolder: "./drizzle",
        },
      }),
    ],
    filter: {
      // Notice that you need one filter per event type.
      // https://www.apibara.com/docs/v2/networks/starknet/filter#events
      events: [
        {
          address: CONTRACT_ADDRESS as `0x${string}`,
          keys: [NEW_LIFEFORM_SELECTOR],
        },
        {
          address: CONTRACT_ADDRESS as `0x${string}`,
          keys: [TRANSFER_SELECTOR],
        },
        {
          address: CONTRACT_ADDRESS as `0x${string}`,
          keys: [NEW_MOVE_SELECTOR],
        },
      ],
    },
    hooks: {
      "connect:after": ({ request }) => {
        // Log the starting cursor
        const logger = useLogger();
        logger.info(`Connected with cursor ${request.startingCursor?.orderKey}/${request.startingCursor?.uniqueKey}`)
      }
    },
    async transform({ endCursor, block }) {
      const logger = useLogger();
      const { db } = useDrizzleStorage();
      const { header, events } = block;
      logger.info(`Current block number: ${header.blockNumber}`);
      logger.info(`Received block ${endCursor?.orderKey} with ${events.length} events`);
      
      // First, process all NewLifeForm events to ensure tokens exist
      const newLifeFormEvents = [];
      const transferEvents = [];
      const newMoveEvents = [];
      const processedTransactions = new Set();

      // Separate events by type
      for (const event of events) {
        const decoded = decodeEvent({
          abi: lifeformAbi,
          event,
          eventName: "gol_starknet::gol_lifeforms::GolLifeforms::Event"
        });

        if (decoded.args._tag === "NewLifeForm") {
          newLifeFormEvents.push({ event, decoded: decoded.args.NewLifeForm });
        } else if (decoded.args._tag === "Transfer") {
          transferEvents.push({ event, decoded: decoded.args.Transfer });
        } else if (decoded.args._tag === "NewMove") {
          newMoveEvents.push({ event, decoded: decoded.args.NewMove });        
        }
      }

      // Process NewLifeForm events first
      for (const { event, decoded } of newLifeFormEvents) {
        logger.info(decoded);
        
        const tokenId = decoded.token_id?.toString();
        
        try {
          // Get a fresh database connection
          const db = database;
          
          // First try to insert the token
          try {
            await db.insert(lifeformTokens).values({
              token_id: tokenId,
              owner: normalizeAddress(decoded.owner),
              is_loop: decoded.lifeform_data.is_loop,
              is_still: decoded.lifeform_data.is_still,
              is_alive: decoded.lifeform_data.is_alive,
              is_dead: decoded.lifeform_data.is_dead,
              sequence_length: Number(decoded.lifeform_data.sequence_length),
              current_state: decoded.lifeform_data.current_state.toString(),
              age: Number(decoded.lifeform_data.age),
            });
            logger.info(`Inserted new token ${tokenId}`);
          } catch (insertError) {
            // If insert fails, try to update
            try {
              await db.update(lifeformTokens)
                .set({
                  owner: normalizeAddress(decoded.owner),
                  is_loop: decoded.lifeform_data.is_loop,
                  is_still: decoded.lifeform_data.is_still,
                  is_alive: decoded.lifeform_data.is_alive,
                  is_dead: decoded.lifeform_data.is_dead,
                  sequence_length: Number(decoded.lifeform_data.sequence_length),
                  current_state: decoded.lifeform_data.current_state.toString(),
                  age: Number(decoded.lifeform_data.age),
                })
                .where(eq(lifeformTokens.token_id, tokenId));
              logger.info(`Updated existing token ${tokenId}`);
            } catch (updateError: unknown) {
              const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
              logger.error(`Failed to update token ${tokenId}: ${errorMessage}`);
            }
          }

          // Record the mint transfer
          const txKey = `${event.transactionHash}-${tokenId}`;
          if (!processedTransactions.has(txKey)) {
            try {
              await db.insert(lifeformTransfers).values({
                token_id: tokenId,
                from_address: normalizeAddress("0x0"), // For mints, from is zero address
                to_address: normalizeAddress(decoded.owner),
                block_number: Number(header.blockNumber),
                transaction_hash: event.transactionHash || "",
              });
              processedTransactions.add(txKey);
              logger.info(`Recorded mint transfer for token ${tokenId}`);
            } catch (transferError) {
              // Ignore duplicate key errors for transfers
              logger.info(`Skipping duplicate transfer for token ${tokenId}`);
            }
          }
        } catch (error: unknown) {
          // Log the error but don't let it abort the entire indexer
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Error processing new lifeform for token ${tokenId}: ${errorMessage}`);
        }
      }

      // Then process Transfer events
      for (const { event, decoded } of transferEvents) {
        logger.info(`Transfer: ${decoded.from} -> ${decoded.to} (token: ${decoded.token_id})`);
        
        const tokenId = decoded.token_id.toString();
        
        try {
          // Get a fresh database connection
          const db = database;
          
          // Try to update the token owner
          try {
            await db.update(lifeformTokens)
              .set({ owner: normalizeAddress(decoded.to) })
              .where(eq(lifeformTokens.token_id, tokenId));
            logger.info(`Updated owner for token ${tokenId}`);
          } catch (updateError: unknown) {
            const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
            logger.error(`Failed to update owner for token ${tokenId}: ${errorMessage}`);
          }

          // Record transfer in history
          const txKey = `${event.transactionHash}-${tokenId}`;
          if (!processedTransactions.has(txKey)) {
            try {
              await db.insert(lifeformTransfers).values({
                token_id: tokenId,
                from_address: normalizeAddress(decoded.from),
                to_address: normalizeAddress(decoded.to),
                block_number: Number(header.blockNumber),
                transaction_hash: event.transactionHash || "",
              });
              processedTransactions.add(txKey);
              logger.info(`Recorded transfer for token ${tokenId}`);
            } catch (transferError) {
              // Ignore duplicate key errors for transfers
              logger.info(`Skipping duplicate transfer for token ${tokenId}`);
            }
          }
        } catch (error: unknown) {
          // Log the error but don't let it abort the entire indexer
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Error processing transfer for token ${tokenId}: ${errorMessage}`);
        }
      }

      // Process NewMove events - optimized batch update
      if (newMoveEvents.length > 0) {
        try {
          // Batch update all tokens in a single query
          const updates = newMoveEvents.map(({ decoded }) => ({
            token_id: decoded.token_id.toString(),
            age: Number(decoded.age)
          }));

          // Use a more efficient batch update query
          await db.execute(sql`
            UPDATE lifeform_tokens AS t
            SET age = c.age
            FROM (VALUES ${sql.join(updates.map(u => sql`(${u.token_id}, ${u.age})`), sql`, `)}) AS c(token_id, age)
            WHERE t.token_id = c.token_id
          `);

          logger.info(`Batch updated age for ${updates.length} tokens`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Error processing batch move updates: ${errorMessage}`);
        }
      }
    },
  });
}