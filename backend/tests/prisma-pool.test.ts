import { describe, expect, it } from "vitest";
import { withConnectionLimit } from "../src/modules/prisma/prisma.service";

/**
 * Prisma defaults its pool to num_cpus * 2 + 1. On the 64-CPU shared host
 * this deploys to that is 129 connections and a thread pool to match, which
 * exhausted the account's task budget and took the site down. These lock in
 * the cap and, just as importantly, that configuration can still override it.
 */
describe("withConnectionLimit", () => {
  it("adds a bounded pool to a URL that has no query string", () => {
    expect(withConnectionLimit("postgresql://u:p@host/db")).toBe("postgresql://u:p@host/db?connection_limit=5");
  });

  it("appends to a URL that already has parameters", () => {
    expect(withConnectionLimit("postgresql://u:p@host/db?sslmode=require")).toBe(
      "postgresql://u:p@host/db?sslmode=require&connection_limit=5",
    );
  });

  it("leaves an explicitly configured limit alone", () => {
    const url = "postgresql://u:p@host/db?connection_limit=20";
    expect(withConnectionLimit(url)).toBe(url);
  });

  it("never silently keeps Prisma's unbounded-by-CPU default", () => {
    expect(withConnectionLimit("postgresql://u:p@host/db")).toMatch(/connection_limit=\d+/);
  });
});
