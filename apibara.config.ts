import { defineConfig } from "apibara/config";

export default defineConfig({
  debug: false,
  runtimeConfig: {
    starknet: {
      startingBlock: 711_270,
      streamUrl: "https://starknet-sepolia.preview.apibara.org",
    },
  },
});
