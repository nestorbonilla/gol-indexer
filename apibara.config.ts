import { defineConfig } from "apibara/config";

export default defineConfig({
  debug: false,
  runtimeConfig: {
    starknet: {
      startingBlock: 635_900,
      streamUrl: "https://starknet-sepolia.preview.apibara.org",
    },
  },
});
