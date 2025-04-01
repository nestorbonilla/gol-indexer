import { defineIndexer } from "@apibara/indexer";
import { drizzleStorage, useDrizzleStorage, drizzle } from "@apibara/plugin-drizzle";
import { getSelector, StarknetStream } from "@apibara/starknet";
import { lifeformTokens } from "@/lib/schema";
import { useLogger } from "@apibara/indexer/plugins";
import type { ApibaraRuntimeConfig } from "apibara/types";
import { parseBool, parseContractAddress, parseStruct, parseU256, parseU32 } from "@apibara/starknet/parser";

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

const CONTRACT_ADDRESS = "0x00f92d3789e679e4ac8e94472ec6a67a63b99d042f772a0227b0d6bd241096c2";
const NEW_LIFEFORM_SELECTOR = getSelector("NewLifeForm");

// Lifeform tokens on Starknet Sepolia
export default function (runtimeConfig: ApibaraRuntimeConfig) {
  const {
    starknet: { startingBlock, streamUrl },
  } = runtimeConfig;

  const database = drizzle({
    schema: {
      lifeformTokens,
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
        persistState: true,
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
      ],
    },
    async transform({ endCursor, block }) {
      const logger = useLogger();
      const { db } = useDrizzleStorage();
      const { events } = block;

      for (const event of events) {
        if (!event.data) continue;

        // Extract all fields from the lifeform data
        const { out: decoded } = parseNewLifeFormEvent(event.data, 0) as { out: NewLifeFormEvent, offset: number };
        logger.info(decoded);
        await db.insert(lifeformTokens).values({
          block_number: Number(endCursor?.orderKey || 0),
          transaction_hash: event.transactionHash || "",
          owner: decoded.owner,
          token_id: decoded.tokenId?.toString(),
          is_loop: decoded.data.isLoop,
          is_still: decoded.data.isStill,
          is_alive: decoded.data.isAlive,
          is_dead: decoded.data.isDead,
          sequence_length: Number(decoded.data.sequenceLength),
          current_state: decoded.data.currentState.toString(),
          age: Number(decoded.data.age),
        });
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
})