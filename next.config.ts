import type { NextConfig } from "next";

// cacheComponents / partialPrefetching are intentionally off: every page depends on the
// role cookie and the data lives in memory, so there is nothing worth caching on the server.
// See ARCHITECTURE.md → D13.
const nextConfig: NextConfig = {
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
