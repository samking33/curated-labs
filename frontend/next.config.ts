import path from "node:path";
import type { NextConfig } from "next";

// ponytail: seed labs live outside apps/web until packages/db exists as a real package.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const config: NextConfig = {
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  /**
   * The proxy below defaults to giving up after 30s and answering with its own
   * "Internal Server Error". A step submission waits on the coach, which is
   * bounded by AI_TASK_BUDGET_MS (45s) plus a retry, so the default turned a
   * slow-but-successful submission into a 500 for the learner while the
   * backend went on to save the answer and return 201. Sit above the backend's
   * own ceiling and let it be the one that decides when to give up.
   */
  experimental: { proxyTimeout: 120_000 },
  // Single-origin proxy: the public hostname serves the app AND the API, so
  // the session cookie is first-party and there is no CORS surface at all.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
};

export default config;
