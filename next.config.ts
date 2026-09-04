import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Server actions cap request bodies at 1MB by default, which most signed
     * agreements exceed. Set a little above the per-file limit the upload
     * enforces, so the file is refused by a message that explains itself
     * rather than by a request that never arrives.
     */
    serverActions: { bodySizeLimit: "12mb" },
  },
  /* config options here */
};

export default nextConfig;
