import { defineIndexer } from "@apibara/indexer";
import { drizzleStorage, useDrizzleStorage, drizzle } from "@apibara/plugin-drizzle";
import { getSelector, StarknetStream, decodeEvent } from "@apibara/starknet";
import { lifeformTokens, lifeformTransfers } from "@/lib/schema";
import { useLogger } from "@apibara/indexer/plugins";
import type { ApibaraRuntimeConfig } from "apibara/types";
import { eq } from "drizzle-orm";
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

const CONTRACT_ADDRESS = "0x7ff678f63c01ee6486fb4d3b0fcb234e7d0656eebf9df01c296accf6f0f73d8";
const NEW_LIFEFORM_SELECTOR = getSelector("NewLifeForm");
const TRANSFER_SELECTOR = getSelector("Transfer");

console.log("Contract address:", CONTRACT_ADDRESS);
console.log("New lifeform selector:", NEW_LIFEFORM_SELECTOR);
console.log("Transfer selector:", TRANSFER_SELECTOR);

// Lifeform tokens on Starknet Sepolia
export default function (runtimeConfig: ApibaraRuntimeConfig) {
  const {
    starknet: { startingBlock, streamUrl },
  } = runtimeConfig;

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
      logger.info(`Current block number: ${block.header.blockNumber}`);
      logger.info(`Received block ${endCursor?.orderKey} with ${events.length} events`);
      
      // First, process all NewLifeForm events to ensure tokens exist
      const newLifeFormEvents = [];
      const transferEvents = [];

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
        }
      }

      // Process NewLifeForm events first
      for (const { event, decoded } of newLifeFormEvents) {
        logger.info(decoded);
        
        // Insert into lifeform_tokens (current state)
        await db.insert(lifeformTokens).values({
          token_id: decoded.token_id?.toString(),
          owner: normalizeAddress(decoded.owner),
          is_loop: decoded.lifeform_data.is_loop,
          is_still: decoded.lifeform_data.is_still,
          is_alive: decoded.lifeform_data.is_alive,
          is_dead: decoded.lifeform_data.is_dead,
          sequence_length: Number(decoded.lifeform_data.sequence_length),
          current_state: decoded.lifeform_data.current_state.toString(),
          age: Number(decoded.lifeform_data.age),
        });

        // Record the mint transfer
        await db.insert(lifeformTransfers).values({
          token_id: decoded.token_id?.toString(),
          from_address: normalizeAddress("0x0"), // For mints, from is zero address
          to_address: normalizeAddress(decoded.owner),
          block_number: Number(header.blockNumber),
          transaction_hash: event.transactionHash || "",
        });
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
    },
  });
} 
