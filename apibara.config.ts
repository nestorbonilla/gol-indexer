import { defineConfig } from "apibara/config";

export default defineConfig({
  debug: false,
  runtimeConfig: {
    starknet: {
      startingBlock: 706_872,
      streamUrl: "https://starknet-sepolia.preview.apibara.org",
    },
  },
});
