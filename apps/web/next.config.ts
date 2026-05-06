import path from "node:path";

import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages have TS sources, not built JS — let Next compile them.
  transpilePackages: ["@lavora/db", "@lavora/core"],
  // Don't try to webpack-bundle Prisma's native engine into the
  // serverless function — Vercel's tracer will pick the binaries up
  // from node_modules at deploy time. Bundling them silently strips
  // the .node binary and the function 500s on first DB query.
  serverExternalPackages: ["@prisma/client", "@prisma/engines", ".prisma/client"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Trace from the monorepo root so Vercel can see pnpm's hoisted
  // node_modules/.pnpm/* layout.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  // Prisma generates into packages/db/prisma-client/ then the Vercel
  // build command copies it into apps/web/prisma-client/ — that's the
  // path the bundled @lavora/db client searches at runtime
  // (/var/task/apps/web/prisma-client in serverless). We trace BOTH
  // locations so file-inclusion works whether Vercel walks from the
  // app dir or the workspace root.
  outputFileTracingIncludes: {
    "/**/*": [
      "./prisma-client/**/*",
      "../../packages/db/prisma-client/**/*",
    ],
  },
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
