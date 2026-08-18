import { describe, expect, it } from "vitest";
import { playgroundScenarioContentSchema, scenarioHeaderSchema } from "@curated-labs/shared";

/**
 * A scenario stored before the threat categories were narrowed no longer
 * satisfies the full content schema. Listing used to parse the whole thing,
 * so one such row failed the entire request and the learner saw no scenarios
 * at all, including every readable one.
 */
const legacyScenario = {
  lab: {
    title: "RideNow: Ride-Hailing Platform Threat Model",
    summary: "A ride-hailing platform matching drivers and riders.",
    businessContext: "A mobility company launching in one city.",
    systemContext: "Rider app, driver app, dispatch service, payments.",
    difficulty: "intermediate",
    estimatedMinutes: 30,
  },
  architectureIssues: [],
  threats: [
    // Values the model produced before the enum was narrowed.
    { id: "00000000-0000-0000-0000-000000000001", title: "Account takeover", description: "d", category: "Identity", expectedPriority: "high", affectedNodeIds: [], affectedEdgeIds: [], acceptedAliases: [] },
  ],
  mitigations: [],
  threatMitigations: [],
  releaseGuidance: { recommendedDecision: "ship_with_conditions", rationale: "r", suggestedConditions: [] },
  dfd: { version: 1, nodes: [], edges: [], trustBoundaries: [] },
};

describe("listing a scenario the current schema cannot fully read", () => {
  it("cannot be parsed by the full content schema", () => {
    expect(playgroundScenarioContentSchema.safeParse(legacyScenario).success).toBe(false);
  });

  it("still yields everything the card needs", () => {
    const header = scenarioHeaderSchema.safeParse(legacyScenario);
    expect(header.success).toBe(true);
    if (header.success) {
      expect(header.data.lab.title).toBe("RideNow: Ride-Hailing Platform Threat Model");
      expect(header.data.lab.difficulty).toBe("intermediate");
      expect(header.data.lab.estimatedMinutes).toBe(30);
    }
  });

  it("rejects content that is genuinely unusable, rather than accepting anything", () => {
    expect(scenarioHeaderSchema.safeParse({ lab: { title: "" } }).success).toBe(false);
    expect(scenarioHeaderSchema.safeParse({}).success).toBe(false);
    expect(scenarioHeaderSchema.safeParse({ lab: { title: "t", summary: "s", difficulty: "impossible", estimatedMinutes: 30 } }).success).toBe(false);
  });
});
