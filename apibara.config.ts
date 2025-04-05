import { defineConfig } from "apibara/config";

export default defineConfig({
  debug: false,
  runtimeConfig: {
    starknet: {
      startingBlock: 653_520,
      streamUrl: "https://starknet-sepolia.preview.apibara.org",
    },
  },
});
