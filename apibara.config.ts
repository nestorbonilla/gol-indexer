import { defineConfig } from "apibara/config";

export default defineConfig({
  debug: false,
  runtimeConfig: {
    starknet: {
      startingBlock: 708_980,
      streamUrl: "https://starknet-sepolia.preview.apibara.org",
    },
  },
});
