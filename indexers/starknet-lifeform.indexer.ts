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

// Contract constants
const CONTRACT_ADDRESS = "0x446cd71afac8c2f2feb03e689e6ec625f0284874f5d47e3ef45bb6873dc9d12";
const NEW_LIFEFORM_SELECTOR = getSelector("NewLifeForm");
const TRANSFER_SELECTOR = getSelector("Transfer");
const NEW_MOVE_SELECTOR = getSelector("NewMove");

// Event handler functions to improve maintainability
async function handleNewLifeForm(
  db: any,
  data: any,
  event: any,
  blockNumber: bigint,
  logger: any
) {
  const tokenId = String(data.token_id);
  
  try {
    // Insert the token data with upsert
    await db.insert(lifeformTokens).values({
      token_id: tokenId,
      owner: normalizeAddress(data.owner),
      is_loop: data.lifeform_data.is_loop,
      is_still: data.lifeform_data.is_still,
      is_alive: data.lifeform_data.is_alive,
      is_dead: data.lifeform_data.is_dead,
      sequence_length: Number(data.lifeform_data.sequence_length),
      current_state: String(data.lifeform_data.current_state),
      age: Number(data.lifeform_data.age),
    }).onConflictDoUpdate({
      target: lifeformTokens.token_id,
      set: {
        owner: normalizeAddress(data.owner),
        is_loop: data.lifeform_data.is_loop,
        is_still: data.lifeform_data.is_still,
        is_alive: data.lifeform_data.is_alive,
        is_dead: data.lifeform_data.is_dead,
        sequence_length: Number(data.lifeform_data.sequence_length),
        current_state: String(data.lifeform_data.current_state),
        age: Number(data.lifeform_data.age),
      }
    });
    
    // Record mint transfer
    await db.insert(lifeformTransfers).values({
      token_id: tokenId,
      from_address: normalizeAddress("0x0"),
      to_address: normalizeAddress(data.owner),
      block_number: Number(blockNumber),
      transaction_hash: event.transactionHash || "",
    }).onConflictDoNothing();
    
    logger.info(`Processed NewLifeForm for token ${tokenId}`);
  } catch (error) {
    logger.error(`Error processing NewLifeForm: ${error}`);
  }
}

async function handleTransfer(
  db: any,
  data: any,
  event: any,
  blockNumber: bigint,
  logger: any
) {
  const tokenId = String(data.token_id);
  
  try {
    // Update owner
    await db.update(lifeformTokens)
      .set({ owner: normalizeAddress(data.to) })
      .where(eq(lifeformTokens.token_id, tokenId));
    
    // Record transfer
    await db.insert(lifeformTransfers).values({
      token_id: tokenId,
      from_address: normalizeAddress(data.from),
      to_address: normalizeAddress(data.to),
      block_number: Number(blockNumber),
      transaction_hash: event.transactionHash || "",
    }).onConflictDoNothing();
    
    logger.info(`Processed Transfer for token ${tokenId}`);
  } catch (error) {
    logger.error(`Error processing Transfer: ${error}`);
  }
}

async function handleNewMove(
  db: any,
  data: any,
  logger: any
) {
  const tokenId = String(data.token_id);
  
  try {
    // Update age
    await db.update(lifeformTokens)
      .set({ age: Number(data.age) })
      .where(eq(lifeformTokens.token_id, tokenId));
    
    logger.info(`Processed NewMove for token ${tokenId}`);
  } catch (error) {
    logger.error(`Error processing NewMove: ${error}`);
  }
}

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

  console.log("Contract address:", CONTRACT_ADDRESS);
  console.log("New lifeform selector:", NEW_LIFEFORM_SELECTOR);
  console.log("Transfer selector:", TRANSFER_SELECTOR);
  console.log("New move selector:", NEW_MOVE_SELECTOR);
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
        const logger = useLogger();
        logger.info(`Connected with cursor ${request.startingCursor?.orderKey}/${request.startingCursor?.uniqueKey}`);
      }
    },
    async transform({ endCursor, block }) {
      const logger = useLogger();
      const { db } = useDrizzleStorage();
      const { header, events } = block;
      
      logger.info(`Processing block ${header.blockNumber} with ${events.length} events`);
      
      try {
        // Process each event individually
        for (const event of events) {
          try {
            const decoded = decodeEvent({
              abi: lifeformAbi,
              event,
              eventName: "gol_starknet::gol_lifeforms::GolLifeforms::Event"
            });
            
            switch (decoded.args._tag) {
              case "NewLifeForm":
                await handleNewLifeForm(db, decoded.args.NewLifeForm, event, header.blockNumber, logger);
                break;
              case "Transfer":
                await handleTransfer(db, decoded.args.Transfer, event, header.blockNumber, logger);
                break;
              case "NewMove":
                await handleNewMove(db, decoded.args.NewMove, logger);
                break;
              default:
                logger.info(`Unhandled event type: ${decoded.args._tag}`);
            }
          } catch (error) {
            logger.error(`Error processing event: ${error}`);
            // Continue to next event
          }
        }
        
        logger.info(`Finished processing block ${header.blockNumber}`);
      } catch (error) {
        logger.error(`Error in block ${header.blockNumber}: ${error}`);
        // Don't throw errors, let the indexer continue
      }
    },
  });
}