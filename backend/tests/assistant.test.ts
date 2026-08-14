import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { AssistantService } from "../src/modules/assistant/assistant.service";

/**
 * Drives AssistantService against a stubbed PrismaService and a stubbed
 * NimClient — no real DB, no real NIM call. Covers the two things a chat
 * feature can get quietly wrong without a test ever catching it: silently
 * blind to one of the two learning modes, and a degraded reply that looks
 * indistinguishable from a real one.
 */

function makeStubPrisma(overrides: {
  labAttempts?: unknown[];
  playgroundAttempts?: unknown[];
} = {}) {
  return {
    labAttempt: { findMany: vi.fn().mockResolvedValue(overrides.labAttempts ?? []) },
    playgroundAttempt: { findMany: vi.fn().mockResolvedValue(overrides.playgroundAttempts ?? []) },
  };
}

function makeStubNim(overrides: { configured?: boolean; chat?: () => Promise<{ text: string }> } = {}) {
  return {
    configured: overrides.configured ?? true,
    chat: overrides.chat ?? vi.fn().mockResolvedValue({ text: "Here's a hint about trust boundaries." }),
  };
}

const stubConfig = { NVIDIA_NIM_MODEL_FAST: "test-fast-model" };

describe("AssistantService.reply", () => {
  it("replies normally when the model call succeeds", async () => {
    const nim = makeStubNim();
    const service = new AssistantService(nim as any, makeStubPrisma() as any, stubConfig as any);
    const result = await service.reply("user-1", [{ role: "user", content: "What is STRIDE?" }]);
    expect(result).toEqual({ reply: "Here's a hint about trust boundaries.", degraded: false });
  });

  it("degrades without throwing when NIM isn't configured", async () => {
    const nim = makeStubNim({ configured: false });
    const service = new AssistantService(nim as any, makeStubPrisma() as any, stubConfig as any);
    const result = await service.reply("user-1", [{ role: "user", content: "Hello" }]);
    expect(result.degraded).toBe(true);
    expect(result.reply).toContain("offline");
  });

  it("degrades without throwing when the model call itself throws", async () => {
    const nim = makeStubNim({ chat: vi.fn().mockRejectedValue(new Error("network blip")) });
    const service = new AssistantService(nim as any, makeStubPrisma() as any, stubConfig as any);
    const result = await service.reply("user-1", [{ role: "user", content: "Hello" }]);
    expect(result.degraded).toBe(true);
    expect(result.reply).not.toContain("network blip"); // never leak the raw error
  });

  it("returns a canned reply without calling the model when the last turn isn't from the user", async () => {
    const nim = makeStubNim();
    const service = new AssistantService(nim as any, makeStubPrisma() as any, stubConfig as any);
    const result = await service.reply("user-1", [{ role: "assistant", content: "..." }]);
    expect(result.degraded).toBe(false);
    expect(nim.chat).not.toHaveBeenCalled();
  });
});

describe("AssistantService context building", () => {
  // contextFor is private; exercised indirectly through reply() by asserting
  // on what the stub Prisma calls actually see and what the model receives.
  it("queries both LabAttempt and PlaygroundAttempt, not just curated labs", async () => {
    const nim = makeStubNim();
    const prisma = makeStubPrisma({
      labAttempts: [{ startedAt: new Date("2026-01-01"), status: "in_progress", currentStep: "threats", lab: { title: "Checkout" } }],
      playgroundAttempts: [{ startedAt: new Date("2026-01-02"), status: "completed", currentStep: "completed", scenario: { title: "RideNow" } }],
    });
    const service = new AssistantService(nim as any, prisma as any, stubConfig as any);
    await service.reply("user-1", [{ role: "user", content: "How am I doing?" }]);

    expect(prisma.labAttempt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
    expect(prisma.playgroundAttempt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));

    // The system prompt (built from contextFor) is the second call arg's `system` field.
    const call = (nim.chat as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.system).toContain("Checkout");
    expect(call.system).toContain("RideNow");
  });

  it("mentions a Playground-only learner's scenario instead of claiming they haven't started a lab", async () => {
    const nim = makeStubNim();
    const prisma = makeStubPrisma({
      labAttempts: [],
      playgroundAttempts: [{ startedAt: new Date("2026-01-02"), status: "in_progress", currentStep: "mitigations", scenario: { title: "Smart Home IoT" } }],
    });
    const service = new AssistantService(nim as any, prisma as any, stubConfig as any);
    await service.reply("user-1", [{ role: "user", content: "How am I doing?" }]);

    const call = (nim.chat as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.system).toContain("Smart Home IoT");
    expect(call.system).not.toContain("has not started a lab");
  });

  it("says so plainly when neither a lab nor a Playground attempt exists", async () => {
    const nim = makeStubNim();
    const service = new AssistantService(nim as any, makeStubPrisma() as any, stubConfig as any);
    await service.reply("user-1", [{ role: "user", content: "Hi" }]);

    const call = (nim.chat as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.system).toContain("has not started a lab or Playground scenario yet");
  });

  it("orders the mixed attempt list by recency across both modes, most recent first", async () => {
    const nim = makeStubNim();
    const prisma = makeStubPrisma({
      labAttempts: [{ startedAt: new Date("2026-01-01"), status: "in_progress", currentStep: "threats", lab: { title: "Older Lab" } }],
      playgroundAttempts: [{ startedAt: new Date("2026-01-05"), status: "in_progress", currentStep: "threats", scenario: { title: "Newer Scenario" } }],
    });
    const service = new AssistantService(nim as any, prisma as any, stubConfig as any);
    await service.reply("user-1", [{ role: "user", content: "Hi" }]);

    const call = (nim.chat as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const newerIndex = call.system.indexOf("Newer Scenario");
    const olderIndex = call.system.indexOf("Older Lab");
    expect(newerIndex).toBeGreaterThan(-1);
    expect(olderIndex).toBeGreaterThan(-1);
    expect(newerIndex).toBeLessThan(olderIndex);
  });
});
