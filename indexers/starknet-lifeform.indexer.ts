import { defineIndexer } from "@apibara/indexer";
import { drizzleStorage, useDrizzleStorage, drizzle } from "@apibara/plugin-drizzle";
import { getSelector, StarknetStream, decodeEvent } from "@apibara/starknet";
import { lifeformTokens, lifeformTransfers, lifeformMoves } from "@/lib/schema";
import { useLogger } from "@apibara/indexer/plugins";
import type { ApibaraRuntimeConfig } from "apibara/types";
import { eq, and } from "drizzle-orm";
import { lifeformAbi } from "@/lib/abi";
import { inArray } from "drizzle-orm";

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

const CONTRACT_ADDRESS = "0x296a8c1446b9da381d6d515242f2c3177256e9318ab7058c97c15968971a33c";
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
  } = runtimeConfig;

  const database = drizzle({
    schema: {
      lifeformTokens,
      lifeformTransfers,
      lifeformMoves,
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
        persistState: true, // Enable persistence, leave false if you want to populate the database from scratch
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
      
      // Log the block hash and parent hash to track block processing
      logger.info(`Block hash: ${header.blockHash}, Parent hash: ${header.parentBlockHash}`);
      
      // Collect all events first
      const newLifeFormEvents = [];
      const transferEvents = [];
      const newMoveEvents = [];

      // Separate events by type
      for (const event of events) {
        const decoded = decodeEvent({
          abi: lifeformAbi,
          event,
          eventName: "gol_starknet::gol_lifeforms::GolLifeforms::Event"
        });

        // Log each event with its transaction hash and index
        logger.info(`Event type: ${decoded.args._tag}, Transaction: ${event.transactionHash}, Index: ${event.transactionIndex}:${event.eventIndex}`);

        if (decoded.args._tag === "NewLifeForm") {
          newLifeFormEvents.push({ event, decoded: decoded.args.NewLifeForm });
        } else if (decoded.args._tag === "Transfer") {
          transferEvents.push({ event, decoded: decoded.args.Transfer });
        } else if (decoded.args._tag === "NewMove") {
          newMoveEvents.push({ event, decoded: decoded.args.NewMove });        
        }
      }

      // Process in batches
      if (newLifeFormEvents.length > 0) {
        logger.info(`Processing ${newLifeFormEvents.length} NewLifeForm events`);
        
        // Filter out existing tokens
        const existingTokens = await db.select({ token_id: lifeformTokens.token_id })
          .from(lifeformTokens)
          .where(
            inArray(
              lifeformTokens.token_id,
              newLifeFormEvents.map(e => e.decoded.token_id?.toString() || "")
            )
          );
        
        const existingTokenIds = new Set(existingTokens.map(t => t.token_id));
        const newTokens = newLifeFormEvents.filter(e => !existingTokenIds.has(e.decoded.token_id?.toString()));
        
        if (newTokens.length > 0) {
          // Batch insert for lifeform tokens
          await db.insert(lifeformTokens).values(
            newTokens.map(({ decoded }) => ({
              token_id: decoded.token_id?.toString(),
              owner: normalizeAddress(decoded.owner),
              is_loop: decoded.lifeform_data.is_loop,
              is_still: decoded.lifeform_data.is_still,
              is_alive: decoded.lifeform_data.is_alive,
              is_dead: decoded.lifeform_data.is_dead,
              sequence_length: Number(decoded.lifeform_data.sequence_length),
              current_state: decoded.lifeform_data.current_state.toString(),
              age: Number(decoded.lifeform_data.age),
            }))
          );
        }
        
        // Filter out existing transfers
        const existingTransfers = await db.select({ 
          token_id: lifeformTransfers.token_id,
          block_number: lifeformTransfers.block_number,
          transaction_hash: lifeformTransfers.transaction_hash
        })
        .from(lifeformTransfers)
        .where(
          inArray(
            lifeformTransfers.token_id,
            newLifeFormEvents.map(e => e.decoded.token_id?.toString() || "")
          )
        );
        
        const existingTransferKeys = new Set(
          existingTransfers.map(t => `${t.token_id}-${t.block_number}-${t.transaction_hash}`)
        );
        
        const newTransfers = newLifeFormEvents.filter(e => {
          const key = `${e.decoded.token_id?.toString()}-${header.blockNumber}-${e.event.transactionHash}`;
          return !existingTransferKeys.has(key);
        });
        
        if (newTransfers.length > 0) {
          // Batch insert for transfers from minting
          await db.insert(lifeformTransfers).values(
            newTransfers.map(({ event, decoded }) => ({
              token_id: decoded.token_id?.toString(),
              from_address: normalizeAddress("0x0"),
              to_address: normalizeAddress(decoded.owner),
              block_number: Number(header.blockNumber),
              transaction_hash: event.transactionHash || "",
            }))
          );
        }
      }

      // Then process Transfer events
      for (const { event, decoded } of transferEvents) {
        logger.info(`Transfer: ${decoded.from} -> ${decoded.to} (token: ${decoded.token_id})`);
        
        // Update current owner in lifeform_tokens
        await db.update(lifeformTokens)
          .set({ owner: normalizeAddress(decoded.to) })
          .where(eq(lifeformTokens.token_id, decoded.token_id.toString()));

        // Record transfer in history
        await db.insert(lifeformTransfers).values({
          token_id: decoded.token_id.toString(),
          from_address: normalizeAddress(decoded.from),
          to_address: normalizeAddress(decoded.to),
          block_number: Number(header.blockNumber),
          transaction_hash: event.transactionHash || "",
        });
      }

      // Process NewMove events
      for (const { event, decoded } of newMoveEvents) {
        logger.info(`NewMove: token ${decoded.token_id} age ${decoded.age}`);
        
        // Update the age in lifeform_tokens
        await db.update(lifeformTokens)
          .set({ age: Number(decoded.age) })
          .where(eq(lifeformTokens.token_id, decoded.token_id.toString()));
          
        // Record the move in lifeform_moves
        await db.insert(lifeformMoves).values({
          token_id: decoded.token_id.toString(),
          caller_address: normalizeAddress("0x0"), // Default to zero address
          block_number: Number(header.blockNumber),
          transaction_hash: event.transactionHash || "",
          age: Number(decoded.age),
        });
      }
    },
  });
} 
