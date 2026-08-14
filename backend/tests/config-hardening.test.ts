import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

/**
 * The hosted deployment forces NODE_ENV=development so ALLOW_DEV_LOGIN can
 * stay on as a stopgap. That silently disabled Secure cookies, HSTS and
 * error redaction on a public HTTPS site — confirmed live by a 500 response
 * carrying absolute server paths. Transport hardening must therefore key off
 * how the app is served, never off NODE_ENV alone.
 */
const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("isHardened", () => {
  it("hardens a public deployment even when NODE_ENV is development", () => {
    const cfg = loadConfig({ ...base, NODE_ENV: "development", PUBLIC_DEPLOYMENT: "true" } as NodeJS.ProcessEnv);
    expect(cfg.isHardened).toBe(true);
    // The dev-login guard still keys off NODE_ENV, so it stays permitted.
    expect(cfg.isProduction).toBe(false);
  });

  it("hardens whenever the app is served over https, however NODE_ENV is set", () => {
    const cfg = loadConfig({ ...base, NODE_ENV: "development", WEB_APP_URL: "https://app.example.com" } as NodeJS.ProcessEnv);
    expect(cfg.isHardened).toBe(true);
  });

  it("hardens in real production", () => {
    const cfg = loadConfig({ ...base, NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(cfg.isHardened).toBe(true);
  });

  it("leaves plain local development unhardened, so http localhost still works", () => {
    const cfg = loadConfig({ ...base, NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(cfg.isHardened).toBe(false);
  });
});
