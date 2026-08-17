import { describe, expect, it } from "vitest";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Fastify rejects some requests before Nest sees them and raises a plain
 * Error with its own statusCode. Those are client mistakes and must not be
 * reported as server faults.
 */
function capture(exception: unknown) {
  let body: any;
  let status = 0;
  const reply = { status(s: number) { status = s; return this; }, send(b: unknown) { body = b; return this; } };
  const host = {
    switchToHttp: () => ({ getResponse: () => reply, getRequest: () => ({ requestId: "req_test" }) }),
  } as never;
  new HttpExceptionFilter(true).catch(exception, host);
  return { status, body };
}

describe("malformed requests", () => {
  it("passes a Fastify 400 through as a client error, not a 500", () => {
    const err = Object.assign(new Error("Body cannot be empty when content-type is set to 'application/json'"), { statusCode: 400 });
    const { status, body } = capture(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("still reports a genuine server fault as 500", () => {
    const { status, body } = capture(new Error("something broke"));
    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
  });

  it("does not leak the raw message in production", () => {
    const { body } = capture(new Error("SELECT * FROM users WHERE secret=1"));
    expect(body.error.message).not.toContain("SELECT");
  });
});
