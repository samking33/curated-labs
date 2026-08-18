import { describe, expect, it } from "vitest";
import { LAB_STEPS, type LabStep } from "@curated-labs/shared";

/** The rail's stops: every workflow step except the completed state. */
const RAIL: LabStep[] = LAB_STEPS.filter((s) => s !== "completed");

/**
 * "completed" is not a stop, so findIndex returns -1 for it. The rail marks a
 * stop done when its index is below the current one, and every index is above
 * -1, which left a finished lab with nothing to revisit: the one state where
 * every step is worth looking back at.
 */
function currentIndex(step: LabStep): number {
  return step === "completed" ? RAIL.length : RAIL.findIndex((s) => s === step);
}
const revisitable = (step: LabStep) => RAIL.filter((_, i) => i < currentIndex(step));

describe("which steps can be revisited", () => {
  it("offers every step once the lab is finished", () => {
    expect(revisitable("completed")).toEqual(RAIL);
  });

  it("offers only what is behind the learner mid-lab", () => {
    expect(revisitable("threats")).toEqual(["intro", "architecture_issues", "attack_surfaces"]);
  });

  it("offers nothing at the very start", () => {
    expect(revisitable("intro")).toEqual([]);
  });

  it("never returns -1 for a real step", () => {
    for (const step of LAB_STEPS) expect(currentIndex(step)).toBeGreaterThanOrEqual(0);
  });
});

/** Back and Next walk the submitted steps, stopping at each end. */
function neighbours(submitted: LabStep[], viewing: LabStep) {
  const i = submitted.indexOf(viewing);
  return { previous: i > 0 ? submitted[i - 1] : undefined, next: i >= 0 && i < submitted.length - 1 ? submitted[i + 1] : undefined };
}

describe("walking back and forward through submitted steps", () => {
  const submitted: LabStep[] = ["architecture_issues", "attack_surfaces", "threats"];

  it("has nothing before the first", () => {
    expect(neighbours(submitted, "architecture_issues").previous).toBeUndefined();
  });

  it("has nothing after the last", () => {
    expect(neighbours(submitted, "threats").next).toBeUndefined();
  });

  it("moves one step at a time in both directions", () => {
    expect(neighbours(submitted, "attack_surfaces")).toEqual({ previous: "architecture_issues", next: "threats" });
  });

  it("skips a step that was never submitted", () => {
    const gappy: LabStep[] = ["architecture_issues", "threats"];
    expect(neighbours(gappy, "architecture_issues").next).toBe("threats");
  });
});
