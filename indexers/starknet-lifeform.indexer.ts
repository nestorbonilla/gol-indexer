import { defineIndexer } from "@apibara/indexer";
import { drizzleStorage, useDrizzleStorage, drizzle } from "@apibara/plugin-drizzle";
import { getSelector, StarknetStream } from "@apibara/starknet";
import { lifeformTokens, lifeformTransfers } from "@/lib/schema";
import { useLogger } from "@apibara/indexer/plugins";
import type { ApibaraRuntimeConfig } from "apibara/types";
import { parseBool, parseContractAddress, parseStruct, parseU256, parseU32 } from "@apibara/starknet/parser";
import { eq } from "drizzle-orm";

// Define types for the parsed event data
type LifeFormData = {
  isLoop: boolean;
  isStill: boolean;
  isAlive: boolean;
  isDead: boolean;
  sequenceLength: bigint;
  currentState: bigint;
  age: bigint;
};

type NewLifeFormEvent = {
  owner: string;
  tokenId: bigint;
  data: LifeFormData;
};

type TransferEvent = {
  from: string;
  to: string;
  tokenId: bigint;
};

const CONTRACT_ADDRESS = "0x00f92d3789e679e4ac8e94472ec6a67a63b99d042f772a0227b0d6bd241096c2";
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
  console.log(`Starting block: ${635900n} at ${streamUrl}`);

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
      events: [
        {
          address: CONTRACT_ADDRESS as `0x${string}`,
          keys: [NEW_LIFEFORM_SELECTOR, TRANSFER_SELECTOR],
        },
      ],
    },
    async transform({ endCursor, block }) {
      const logger = useLogger();
      const { db } = useDrizzleStorage();
      const { events } = block;
      console.log(`Current block number: ${block.header.blockNumber}`);
      console.log(`Received block ${endCursor?.orderKey} with ${events.length} events`);
      
      for (const event of events) {
        if (!event.data) continue;

        if (event.keys[0] === NEW_LIFEFORM_SELECTOR) {
          // Extract all fields from the lifeform data
          const { out: decoded } = parseNewLifeFormEvent(event.data, 0) as { out: NewLifeFormEvent, offset: number };
          logger.info(decoded);
          
          // Insert into lifeform_tokens (current state)
          await db.insert(lifeformTokens).values({
            token_id: decoded.tokenId?.toString(),
            owner: decoded.owner,
            is_loop: decoded.data.isLoop,
            is_still: decoded.data.isStill,
            is_alive: decoded.data.isAlive,
            is_dead: decoded.data.isDead,
            sequence_length: Number(decoded.data.sequenceLength),
            current_state: decoded.data.currentState.toString(),
            age: Number(decoded.data.age),
          });

          // Record the mint transfer
          await db.insert(lifeformTransfers).values({
            token_id: decoded.tokenId?.toString(),
            from_address: "0x0", // For mints, from is 0x0
            to_address: decoded.owner,
            block_number: Number(endCursor?.orderKey || 0),
            transaction_hash: event.transactionHash || "",
          });

        } else if (event.keys[0] === TRANSFER_SELECTOR) {
          // Extract transfer event data
          const { out: decoded } = parseTransferEvent(event.data, 0) as { out: TransferEvent, offset: number };
          logger.info(`Transfer: ${decoded.from} -> ${decoded.to} (token: ${decoded.tokenId})`);
          
          // Update current owner in lifeform_tokens
          await db.update(lifeformTokens)
            .set({ owner: decoded.to })
            .where(eq(lifeformTokens.token_id, decoded.tokenId.toString()));

          // Record transfer in history
          await db.insert(lifeformTransfers).values({
            token_id: decoded.tokenId.toString(),
            from_address: decoded.from,
            to_address: decoded.to,
            block_number: Number(endCursor?.orderKey || 0),
            transaction_hash: event.transactionHash || "",
          });
        }
      }
    },
  });
} 

/* The built-in event decoder does not support all Cairo abi yet.
 *
 * In this case it would fail, for this reason I'm creating the "abi parser" manually.
 */

const parseLifeFormData = parseStruct({
  isLoop: { index: 0, parser: parseBool },
  isStill: { index: 1, parser: parseBool },
  isAlive: { index: 2, parser: parseBool },
  isDead: { index: 3, parser: parseBool },
  sequenceLength: { index: 4, parser: parseU32 },
  currentState: { index: 5, parser: parseU256 },
  age: { index: 6, parser: parseU32 },
});

const parseNewLifeFormEvent = parseStruct({
  owner: { index: 0, parser: parseContractAddress },
  tokenId: { index: 1, parser: parseU256 },
  data: { index: 2, parser: parseLifeFormData }
});

const parseTransferEvent = parseStruct({
  from: { index: 0, parser: parseContractAddress },
  to: { index: 1, parser: parseContractAddress },
  tokenId: { index: 2, parser: parseU256 }
});