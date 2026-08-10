import path from "node:path";
import type { NextConfig } from "next";

// ponytail: seed labs live outside apps/web until packages/db exists as a real package.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const config: NextConfig = {
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Single-origin proxy: the public hostname serves the app AND the API, so
  // the session cookie is first-party and there is no CORS surface at all.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
};

export default config;
