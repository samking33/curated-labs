import { describe, expect, it } from "vitest";
import {
  architectureIssuesSubmissionSchema,
  prioritizationSubmissionSchema,
  releaseDecisionSubmissionSchema,
  threatsSubmissionSchema,
} from "@curated-labs/shared";

/**
 * Whitespace must never satisfy a required free-text answer. Reported from
 * real use: "I entered two threats and kept the next one blank. It accepted a
 * blank threat." The UI drops empty rows, so this pins the API itself.
 */
describe("free-text answers reject whitespace", () => {
  it("rejects a whitespace-only threat among valid ones", () => {
    const result = threatsSubmissionSchema.safeParse({
      threats: ["session token can be stolen", "   ", "webhook is unsigned"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an entirely blank threat list", () => {
    expect(threatsSubmissionSchema.safeParse({ threats: [""] }).success).toBe(false);
  });

  it("trims surrounding whitespace off an accepted answer", () => {
    const result = threatsSubmissionSchema.safeParse({ threats: ["  a real threat  "] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.threats[0]).toBe("a real threat");
  });

  it("rejects whitespace-only architecture findings", () => {
    expect(architectureIssuesSubmissionSchema.safeParse({ text: "\n\t  " }).success).toBe(false);
  });

  it("rejects a whitespace-only prioritization rationale", () => {
    const result = prioritizationSubmissionSchema.safeParse({
      items: [{ threatId: "11111111-1111-4111-8111-111111111111", priority: "high", rationale: "  " }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only release rationale", () => {
    expect(
      releaseDecisionSubmissionSchema.safeParse({ decision: "ship_it", rationale: "   " }).success,
    ).toBe(false);
  });
});
