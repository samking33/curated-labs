import { describe, expect, it } from "vitest";
import { LAB_STEPS, nextStep, stepIndex, type LabStep } from "@curated-labs/shared";

/**
 * An attempt's position may only move forwards. Submitting a step the learner
 * has already passed used to set the position to whatever followed THAT step,
 * so re-answering step one from the decision step dropped them back to attack
 * surfaces with five steps of progress apparently undone.
 */
function positionAfter(current: LabStep, submitted: LabStep, advanceTo?: LabStep): LabStep {
  const proposed = advanceTo ?? nextStep(submitted);
  return stepIndex(current) > stepIndex(proposed) ? current : proposed;
}

describe("an attempt's position", () => {
  it("advances normally through the workflow", () => {
    expect(positionAfter("architecture_issues", "architecture_issues")).toBe("attack_surfaces");
    expect(positionAfter("attack_surfaces", "attack_surfaces")).toBe("threats");
    expect(positionAfter("mitigations", "mitigations")).toBe("release_decision");
  });

  it("does not move back when an earlier step is submitted again", () => {
    expect(positionAfter("release_decision", "architecture_issues")).toBe("release_decision");
    expect(positionAfter("mitigations", "threats")).toBe("mitigations");
    expect(positionAfter("completed", "prioritization")).toBe("completed");
  });

  it("still honours an explicit target that moves forward", () => {
    expect(positionAfter("threats", "threats", "prioritization")).toBe("prioritization");
  });

  it("holds a retry on the threats step, which does not advance until revealed", () => {
    expect(positionAfter("threats", "threats", "threats")).toBe("threats");
  });

  it("never lands outside the workflow, whatever it is given", () => {
    for (const current of LAB_STEPS) {
      for (const submitted of LAB_STEPS) {
        const result = positionAfter(current, submitted);
        expect(LAB_STEPS).toContain(result);
        expect(stepIndex(result)).toBeGreaterThanOrEqual(stepIndex(current));
      }
    }
  });
});
