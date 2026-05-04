import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages have TS sources, not built JS — let Next compile them.
  transpilePackages: ["@lavora/db", "@lavora/core"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Quiet the harmless warning about a missing root in monorepos.
  outputFileTracingRoot: process.cwd().split("apps")[0],
  webpack: (cfg) => {
    // Our workspace packages use Node's ESM convention of writing
    // imports with a `.js` extension even though the source is `.ts`
    // (tsx and Node ESM both map this correctly). Webpack doesn't —
    // teach it to fall back to `.ts` / `.tsx` so transpilePackages can
    // load them without us rewriting every import.
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.extensionAlias = {
      ...(cfg.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return cfg;
  },
};

export default config;
