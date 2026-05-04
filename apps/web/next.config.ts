import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages have TS sources, not built JS — let Next compile them.
  transpilePackages: ["@lavora/db", "@lavora/core"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Quiet the harmless warning about a missing root in monorepos.
  outputFileTracingRoot: process.cwd().split("apps")[0],
};

export default config;
