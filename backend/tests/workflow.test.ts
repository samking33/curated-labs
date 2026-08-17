import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import {
  assertKnownThreatIds,
  assertStepAllowed,
  comparePriorities,
  gradeMitigations,
  replayResult,
} from "../src/common/workflow";

/**
 * Pure grading/ordering logic shared by the curated and playground attempts
 * services (see backend/src/common/workflow.ts). Extracted from
 * AttemptsService verbatim — these tests are the safety net for that move.
 */

describe("assertStepAllowed", () => {
  it("allows re-submitting the current step", () => {
    expect(() => assertStepAllowed("threats", "threats")).not.toThrow();
  });

  it("allows advancing exactly one step", () => {
    expect(() => assertStepAllowed("architecture_issues", "attack_surfaces")).not.toThrow();
    expect(() => assertStepAllowed("attack_surfaces", "threats")).not.toThrow();
  });

  it("rejects skipping ahead", () => {
    expect(() => assertStepAllowed("intro", "mitigations")).toThrow(BadRequestException);
  });
});

describe("replayResult", () => {
  it("returns stored feedback with zero points/cheers", () => {
    const result = replayResult(
      { id: "sub-1", attemptNumber: 2, aiFeedbackJson: { summary: "ok" }, deterministicResultJson: { hits: 3 } },
      "threats",
    );
    expect(result).toMatchObject({
      submissionId: "sub-1",
      attemptNumber: 2,
      currentStep: "threats",
      aiFeedback: { summary: "ok" },
      aiStatus: "ok",
      deterministicResult: { hits: 3 },
      pointsAwarded: 0,
      cheers: [],
    });
  });

  it("reports aiStatus unavailable when no feedback was stored", () => {
    const result = replayResult(
      { id: "sub-2", attemptNumber: 1, aiFeedbackJson: null, deterministicResultJson: null },
      "prioritization",
    );
    expect(result.aiStatus).toBe("unavailable");
  });
});

describe("assertKnownThreatIds", () => {
  it("passes when every id is in the known set", () => {
    expect(() =>
      assertKnownThreatIds([{ threatId: "t1" }, { threatId: "t2" }], new Set(["t1", "t2"])),
    ).not.toThrow();
  });

  it("rejects an id from another lab", () => {
    expect(() => assertKnownThreatIds([{ threatId: "t1" }, { threatId: "foreign" }], new Set(["t1"]))).toThrow(
      BadRequestException,
    );
  });
});

describe("comparePriorities", () => {
  it("flags matches and mismatches against the canonical priority", () => {
    const canonical = [
      { id: "t1", expectedPriority: "critical" },
      { id: "t2", expectedPriority: "low" },
    ];
    const result = comparePriorities(
      [
        { threatId: "t1", priority: "critical", rationale: "r1" },
        { threatId: "t2", priority: "high", rationale: "r2" },
      ],
      canonical,
    );
    expect(result).toEqual([
      { threatId: "t1", learnerPriority: "critical", expectedPriority: "critical", matches: true },
      { threatId: "t2", learnerPriority: "high", expectedPriority: "low", matches: false },
    ]);
  });
});

describe("gradeMitigations", () => {
  it("marks pairings correct only if they exist in the answer key", () => {
    const answerKey = [
      { threatId: "t1", mitigationId: "m1" },
      { threatId: "t2", mitigationId: "m2" },
    ];
    const result = gradeMitigations(
      [
        { threatId: "t1", mitigationId: "m1" },
        { threatId: "t2", mitigationId: "wrong" },
      ],
      answerKey,
    );
    expect(result).toEqual({
      pairings: [
        { threatId: "t1", mitigationId: "m1", isCorrect: true },
        { threatId: "t2", mitigationId: "wrong", isCorrect: false },
      ],
      correctCount: 1,
      totalCount: 2,
    });
  });
});
