import { defineIndexer } from "@apibara/indexer";
import { drizzleStorage, useDrizzleStorage, drizzle } from "@apibara/plugin-drizzle";
import { StarknetStream } from "@apibara/starknet";
import { lifeformTokens } from "@/lib/schema";
import { useLogger } from "@apibara/indexer/plugins";
import type { ApibaraRuntimeConfig } from "apibara/types";

const CONTRACT_ADDRESS = "0x00f92d3789e679e4ac8e94472ec6a67a63b99d042f772a0227b0d6bd241096c2";
const NEW_LIFEFORM_SELECTOR = "0x11f46882e19ad05d3762feda18b95af02b4d04ff264658de9665ede8f823262";

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
        persistState: false,
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
          keys: [NEW_LIFEFORM_SELECTOR as `0x${string}`],
        },
      ],
    },
    async transform({ endCursor, block, context, finality }) {
      const logger = useLogger();
      const { db } = useDrizzleStorage();
      const { events } = block;

      logger.info(
        "Transforming block | orderKey: ",
        endCursor?.orderKey,
        " | finality: ",
        finality,
      );

      for (const event of events) {
        if (!event.data) continue;

        const owner = event.data[0];
        const tokenId = event.data[1];
        const lifeformData = event.data[2] as any;

        // Extract all fields from the lifeform data
        const isLoop = lifeformData.is_loop.value === "0x1";
        const isStill = lifeformData.is_still.value === "0x1";
        const isAlive = lifeformData.is_alive.value === "0x1";
        const isDead = lifeformData.is_dead.value === "0x1";
        const sequenceLength = parseInt(lifeformData.sequence_length.value.slice(2), 16);
        const currentState = lifeformData.current_state.value;
        const age = parseInt(lifeformData.age.value.slice(2), 16);

        await db.insert(lifeformTokens).values({
          block_number: Number(endCursor?.orderKey || 0),
          transaction_hash: event.transactionHash || "",
          owner: `0x${BigInt(owner).toString(16)}`,
          token_id: BigInt(tokenId).toString(),
          is_loop: isLoop,
          is_still: isStill,
          is_alive: isAlive,
          is_dead: isDead,
          sequence_length: sequenceLength,
          current_state: currentState,
          age: age,
        });
      }
    },
  });
} 