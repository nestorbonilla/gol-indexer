import { defineConfig } from "apibara/config";

export default defineConfig({
  debug: false,
  runtimeConfig: {
    starknet: {
      startingBlock: 658_070,
      streamUrl: "https://starknet-sepolia.preview.apibara.org",
    },
  },
});
