import { defineIndexer } from "@apibara/indexer";
import { drizzleStorage, useDrizzleStorage, drizzle } from "@apibara/plugin-drizzle";
import { getSelector, StarknetStream, decodeEvent } from "@apibara/starknet";
import { lifeformTokens, lifeformTransfers } from "@/lib/schema";
import { useLogger } from "@apibara/indexer/plugins";
import type { ApibaraRuntimeConfig } from "apibara/types";
import { eq } from "drizzle-orm";
import { lifeformAbi } from "@/lib/abi";

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
      
      for (const event of events) {
        // Decode the event based on the lifeform ABI
        const decoded = decodeEvent({
          abi: lifeformAbi,
          event,
          eventName: "gol_starknet::gol_lifeforms::GolLifeforms::Event"
        })

        // Notice that the type of `decoded.args._tag` is an enum, so the case statements will
        // autocomplete with the event names.
        switch (decoded.args._tag) {
          case "NewLifeForm": {
            const newLifeForm = decoded.args.NewLifeForm;
            logger.info(newLifeForm);
            
            // Insert into lifeform_tokens (current state)
            await db.insert(lifeformTokens).values({
              token_id: newLifeForm.token_id?.toString(),
              owner: newLifeForm.owner,
              is_loop: newLifeForm.lifeform_data.is_loop,
              is_still: newLifeForm.lifeform_data.is_still,
              is_alive: newLifeForm.lifeform_data.is_alive,
              is_dead: newLifeForm.lifeform_data.is_dead,
              sequence_length: Number(newLifeForm.lifeform_data.sequence_length),
              current_state: newLifeForm.lifeform_data.current_state.toString(),
              age: Number(newLifeForm.lifeform_data.age),
            });

            // Record the mint transfer
            await db.insert(lifeformTransfers).values({
              token_id: newLifeForm.token_id?.toString(),
              from_address: "0x0000000000000000000000000000000000000000000000000000000000000000", // For mints, from is zero address
              to_address: newLifeForm.owner,
              block_number: Number(header.blockNumber),
              transaction_hash: event.transactionHash || "",
            });
            break;
          }
          case "Transfer": {
            // Get value of inner `Transfer` event.
            const transfer = decoded.args.Transfer;
            logger.info(`Transfer: ${transfer.from} -> ${transfer.to} (token: ${transfer.token_id})`);
            
            // Update current owner in lifeform_tokens
            await db.update(lifeformTokens)
              .set({ owner: transfer.to })
              .where(eq(lifeformTokens.token_id, transfer.token_id.toString()));

            // Record transfer in history
            await db.insert(lifeformTransfers).values({
              token_id: transfer.token_id.toString(),
              from_address: transfer.from,
              to_address: transfer.to,
              block_number: Number(header.blockNumber),
              transaction_hash: event.transactionHash || "",
            });

            break;
          }
        }
      }
    },
  });
} 
