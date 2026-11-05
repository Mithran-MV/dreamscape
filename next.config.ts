import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only SDKs stay out of the bundle and load from node_modules at runtime.
  serverExternalPackages: ["@0gfoundation/0g-storage-ts-sdk", "@0gfoundation/0g-compute-ts-sdk", "sharp"],
  cacheComponents: true,
  partialPrefetching: true,
  // The service worker must never be served stale, and may only load its own code.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
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
