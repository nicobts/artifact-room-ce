import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal traced server + node_modules for a small, non-root container image.
  // See docs/10-configuration.md.
  output: "standalone",

  // better-sqlite3 is a native module; keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
