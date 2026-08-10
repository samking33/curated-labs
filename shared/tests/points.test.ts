import { describe, expect, it } from "vitest";
import { POINTS, POINT_REASONS, cheerFor } from "../src/schemas/points.js";

describe("point values", () => {
  it("gives every reason a positive amount", () => {
    for (const reason of POINT_REASONS) {
      expect(POINTS[reason]).toBeGreaterThan(0);
    }
  });

  it("weights step 4 (the only explicitly-graded step per §8) above flat participation", () => {
    expect(POINTS.mitigation_correct).toBeGreaterThan(POINTS.architecture_submitted);
    expect(POINTS.mitigation_correct).toBeGreaterThan(POINTS.release_submitted);
  });
});

describe("cheerFor", () => {
  it("is deterministic — same reason and occurrence always says the same thing", () => {
    expect(cheerFor("threat_matched", 0)).toBe(cheerFor("threat_matched", 0));
  });

  it("cycles through its options rather than repeating the first one forever", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) seen.add(cheerFor("mitigation_correct", i));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("has copy for every reason a learner can actually be cheered for", () => {
    // architecture_submitted / release_submitted are flat participation
    // awards, not "correct answers" — PointsService.cheersFor skips them by
    // design, so cheerFor only needs to cover the rest.
    for (const reason of ["threat_matched", "threats_clean_sweep", "priority_correct", "mitigation_correct", "lab_completed"] as const) {
      expect(cheerFor(reason, 0).length).toBeGreaterThan(0);
    }
  });
});
