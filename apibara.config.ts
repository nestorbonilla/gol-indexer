import { defineConfig } from "apibara/config";

export default defineConfig({
  debug: false,
  runtimeConfig: {
    starknet: {
      startingBlock: 673_340,
      streamUrl: "https://starknet-sepolia.preview.apibara.org",
    },
  },
});
