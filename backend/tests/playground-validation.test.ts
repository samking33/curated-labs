import { describe, expect, it } from "vitest";
import {
  playgroundScenarioDraftSchema,
  validateGeneratedScenario,
  type PlaygroundScenarioDraft,
} from "@curated-labs/shared";

/**
 * Fixtures against the generation gate (shared/src/schemas/playground.ts).
 * These are the checks that stand between a hallucinating model and an
 * ungradeable scenario reaching a learner.
 */

const TEST_SENTINEL = "TEST-SENTINEL-DO-NOT-ECHO";

function baseDraft(overrides: Partial<PlaygroundScenarioDraft> = {}): PlaygroundScenarioDraft {
  const raw = {
    lab: {
      title: "A Payments Sandbox",
      summary: "A small payments system for practice.",
      businessContext: "A fictional startup processing card payments.",
      systemContext: "One API, one database, one third-party processor.",
      difficulty: "intermediate" as const,
      estimatedMinutes: 20,
    },
    dfd: {
      version: "1.0",
      nodes: [
        { id: "n1", type: "external_entity" as const, label: "Customer", trustBoundary: "internet" },
        { id: "n2", type: "process" as const, label: "API", trustBoundary: "private" },
        { id: "n3", type: "data_store" as const, label: "DB", trustBoundary: "private" },
        { id: "n4", type: "third_party" as const, label: "Processor", trustBoundary: "internet" },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n2", target: "n4" },
      ],
      trustBoundaries: [
        { id: "internet", label: "Internet", description: "" },
        { id: "private", label: "Private Network", description: "" },
      ],
    },
    architectureIssues: [
      { key: "ai1", title: "No rate limiting", description: "d", affectedNodeIds: ["n2"] },
      { key: "ai2", title: "Plaintext logs", description: "d", affectedNodeIds: ["n3"] },
    ],
    threats: [
      { key: "t1", title: "Card skimming", description: "d", category: "Tampering", expectedPriority: "critical" as const, affectedNodeIds: ["n2"] },
      { key: "t2", title: "DB exfiltration", description: "d", category: "Information disclosure", expectedPriority: "high" as const, affectedNodeIds: ["n3"] },
      { key: "t3", title: "Processor spoofing", description: "d", category: "Spoofing", expectedPriority: "medium" as const, affectedNodeIds: ["n4"] },
    ],
    mitigations: [
      { key: "m1", title: "Tokenize cards", description: "d" },
      { key: "m2", title: "Encrypt at rest", description: "d" },
      { key: "m3", title: "Verify processor certs", description: "d" },
    ],
    threatMitigations: [
      { threatKey: "t1", mitigationKey: "m1" },
      { threatKey: "t2", mitigationKey: "m2" },
      { threatKey: "t3", mitigationKey: "m3" },
    ],
    releaseGuidance: {
      recommendedDecision: "ship_with_conditions" as const,
      rationale: "Fine once tokenization ships.",
      suggestedConditions: ["Ship tokenization first"],
    },
    ...overrides,
  };
  return playgroundScenarioDraftSchema.parse(raw);
}

describe("validateGeneratedScenario", () => {
  it("accepts a well-formed scenario", () => {
    expect(validateGeneratedScenario(baseDraft(), TEST_SENTINEL)).toEqual([]);
  });

  it("rejects an edge whose source is not a node id at PARSE time", () => {
    const raw = {
      lab: {
        title: "x", summary: "x", businessContext: "x", systemContext: "x",
        difficulty: "beginner", estimatedMinutes: 10,
      },
      dfd: {
        version: "1.0",
        nodes: [{ id: "n1", type: "process", label: "A" }],
        edges: [{ id: "e1", source: "ghost", target: "n1" }],
        trustBoundaries: [],
      },
      architectureIssues: [],
      threats: [],
      mitigations: [],
      threatMitigations: [],
      releaseGuidance: { recommendedDecision: "ship_it", rationale: "x", suggestedConditions: [] },
    };
    expect(() => playgroundScenarioDraftSchema.parse(raw)).toThrow();
  });

  it("rejects a threat with no mitigation mapping — the ungradeable-step-4 case", () => {
    const draft = baseDraft({
      threatMitigations: [
        { threatKey: "t1", mitigationKey: "m1", isPrimary: true },
        { threatKey: "t2", mitigationKey: "m2", isPrimary: true },
        // t3 deliberately left unmapped
      ],
    } as Partial<PlaygroundScenarioDraft>);
    const errors = validateGeneratedScenario(draft, TEST_SENTINEL);
    expect(errors).toContain('threat t3 has no mitigation mapping');
  });

  it("rejects an architecture issue referencing an unknown node", () => {
    const draft = baseDraft({
      architectureIssues: [
        { key: "ai1", title: "x", description: "d", affectedNodeIds: ["ghost-node"], affectedEdgeIds: [] },
        { key: "ai2", title: "y", description: "d", affectedNodeIds: [], affectedEdgeIds: [] },
      ],
    } as Partial<PlaygroundScenarioDraft>);
    const errors = validateGeneratedScenario(draft, TEST_SENTINEL);
    expect(errors.some((e) => e.includes("unknown node"))).toBe(true);
  });

  it("rejects a duplicate threat key", () => {
    const draft = baseDraft({
      threats: [
        { key: "t1", title: "a", description: "d", category: "Spoofing", expectedPriority: "high", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
        { key: "t1", title: "b", description: "d", category: "Spoofing", expectedPriority: "low", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
        { key: "t3", title: "c", description: "d", category: "Spoofing", expectedPriority: "medium", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
      ],
      threatMitigations: [
        { threatKey: "t1", mitigationKey: "m1", isPrimary: true },
        { threatKey: "t3", mitigationKey: "m3", isPrimary: true },
      ],
    } as Partial<PlaygroundScenarioDraft>);
    const errors = validateGeneratedScenario(draft, TEST_SENTINEL);
    expect(errors).toContain('duplicate threat key "t1"');
  });

  it("rejects a scenario below the minimum node count", () => {
    const draft = baseDraft({
      dfd: {
        version: "1.0",
        nodes: [
          { id: "n1", type: "external_entity", label: "Customer" },
          { id: "n2", type: "process", label: "API" },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2" },
          { id: "e2", source: "n2", target: "n1" },
          { id: "e3", source: "n1", target: "n2" },
        ],
        trustBoundaries: [],
      },
      architectureIssues: [
        { key: "ai1", title: "x", description: "d", affectedNodeIds: [], affectedEdgeIds: [] },
        { key: "ai2", title: "y", description: "d", affectedNodeIds: [], affectedEdgeIds: [] },
      ],
      threats: [
        { key: "t1", title: "a", description: "d", category: "Spoofing", expectedPriority: "high", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
        { key: "t2", title: "b", description: "d", category: "Spoofing", expectedPriority: "low", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
        { key: "t3", title: "c", description: "d", category: "Spoofing", expectedPriority: "medium", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
      ],
    } as unknown as Partial<PlaygroundScenarioDraft>);
    const errors = validateGeneratedScenario(draft, TEST_SENTINEL);
    expect(errors).toContain("dfd.nodes: 2 is below the minimum of 4");
  });

  it("rejects output that echoes the generator's own instructions", () => {
    const draft = baseDraft({
      lab: {
        title: "A Payments Sandbox",
        summary: `Contains the phrase ${TEST_SENTINEL} somewhere in the output.`,
        businessContext: "x",
        systemContext: "x",
        difficulty: "intermediate",
        estimatedMinutes: 20,
      },
    } as Partial<PlaygroundScenarioDraft>);
    const errors = validateGeneratedScenario(draft, TEST_SENTINEL);
    expect(errors).toContain("output echoed the generator instructions");
  });

  it("rejects a scenario over the serialized-size limit", () => {
    const draft = baseDraft({
      threats: [
        { key: "t1", title: "a", description: "x".repeat(200_000), category: "Spoofing", expectedPriority: "high", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
        { key: "t2", title: "b", description: "d", category: "Spoofing", expectedPriority: "low", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
        { key: "t3", title: "c", description: "d", category: "Spoofing", expectedPriority: "medium", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
      ],
    } as Partial<PlaygroundScenarioDraft>);
    const errors = validateGeneratedScenario(draft, TEST_SENTINEL);
    expect(errors.some((e) => e.includes("over the 60000 limit"))).toBe(true);
  });
});
