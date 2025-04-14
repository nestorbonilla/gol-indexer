import { defineConfig } from "apibara/config";

export default defineConfig({
  debug: false,
  runtimeConfig: {
    starknet: {
      startingBlock: 688_940,
      streamUrl: "https://starknet-sepolia.preview.apibara.org",
    },
  },
});
