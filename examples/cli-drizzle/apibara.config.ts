import { defineConfig } from "apibara/config";

export default defineConfig({
  runtimeConfig: {
    starknet: {
      startingBlock: 635_911,
      streamUrl: "https://starknet-sepolia.preview.apibara.org",
    },
  },
});
