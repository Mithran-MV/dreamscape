import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only SDKs stay out of the bundle and load from node_modules at runtime.
  serverExternalPackages: ["@0gfoundation/0g-storage-ts-sdk", "@0gfoundation/0g-compute-ts-sdk", "sharp"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
