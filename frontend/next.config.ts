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

  /**
   * The API sets its own headers through helmet, but those only cover API
   * responses. Every page a browser actually renders comes from here and had
   * none, which left the app framable by any site and with no content policy
   * at all.
   *
   * Two policies, because the vendored draw.io build genuinely needs `eval`
   * and the rest of the app does not: it gets its own looser rule confined to
   * its own path rather than weakening the policy everywhere. `unsafe-inline`
   * stays for scripts (Next inlines its hydration payload) and for styles
   * (every component here is inline-styled from tokens.ts).
   */
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    const policy = (extraScript: string) =>
      [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${extraScript}`,
        "style-src 'self' 'unsafe-inline'",
        // Profile pictures come from the Google account that signed in.
        "img-src 'self' data: blob: https://lh3.googleusercontent.com",
        "font-src 'self' data:",
        // Same-origin only: the API is reached through the rewrite above.
        "connect-src 'self'",
        "frame-src 'self'",
        // Self, so the app can frame its own editor; nobody else may frame us.
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; ");

    return [
      {
        source: "/drawio/:path*",
        headers: [...common, { key: "Content-Security-Policy", value: policy(" 'unsafe-eval'") }],
      },
      {
        // Everything except the editor, which is matched above. Both rules
        // matching one path would leave the last one to win, and that is the
        // strict policy, so the editor's exception has to be carved out here.
        source: "/((?!drawio/).*)",
        headers: [...common, { key: "Content-Security-Policy", value: policy("") }],
      },
    ];
  },
};

export default config;
