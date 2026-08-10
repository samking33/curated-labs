import { describe, expect, it } from "vitest";
import { redactSecrets, restrictIds } from "../src/schemas/ai.js";

/**
 * Regression cover for a leak found by probing the live API: a prompt injection
 * made the model write the whole canonical threat list — ids, descriptions and
 * aliases — into `extraObservations` on the first attempt, before reveal was
 * earned. Schema validation passed it through because the field is free text.
 */
const THREAT_DESC =
  "An attacker with read access to the session cache can lift a live session identifier and act as that customer.";
const ALIAS = "cookie theft from cache; account takeover via session";

describe("redactSecrets", () => {
  it("drops an array entry that reproduces a curated description", () => {
    const payload = {
      feedback: "Good start.",
      extraObservations: [
        `id=d3a94258-4e5d-43a7-81da-81056884bdec | Session hijacking: ${THREAT_DESC}`,
        "You might also consider rate limiting.",
      ],
    };
    const { value, redactions } = redactSecrets(payload, [THREAT_DESC, ALIAS]);
    expect(redactions).toBe(1);
    expect(value.extraObservations).toEqual(["You might also consider rate limiting."]);
  });

  it("masks bare canonical ids that leak through prose", () => {
    const { value, redactions } = redactSecrets(
      { feedback: "See threat 71d7724c-02c9-49cc-82cb-b1d9e673d600 for detail." },
      [],
    );
    expect(redactions).toBe(1);
    expect(value.feedback).toBe("See threat [id] for detail.");
  });

  it("leaves legitimate coaching untouched", () => {
    const payload = {
      summary: "You spotted the plaintext session store — good instinct.",
      coachingTips: ["Think about what crosses a trust boundary."],
    };
    const { value, redactions } = redactSecrets(payload, [THREAT_DESC, ALIAS]);
    expect(redactions).toBe(0);
    expect(value).toEqual(payload);
  });

  it("ignores short secrets so common phrasing is not over-redacted", () => {
    // A learner writing "session theft" must not trigger redaction just because
    // it happens to be a stored alias.
    const { redactions } = redactSecrets({ feedback: "This is session theft." }, ["session theft"]);
    expect(redactions).toBe(0);
  });

  it("recurses into nested objects and arrays", () => {
    const { value, redactions } = redactSecrets(
      { items: [{ note: THREAT_DESC }, { note: "fine" }] },
      [THREAT_DESC],
    );
    expect(redactions).toBe(1);
    expect(value.items[0]!.note).toBe("");
  });
});

describe("restrictIds", () => {
  it("keeps supplied ids and reports invented ones", () => {
    const { kept, dropped } = restrictIds(
      [{ id: "a" }, { id: "ghost" }],
      (i) => i.id,
      ["a", "b"],
    );
    expect(kept).toEqual([{ id: "a" }]);
    expect(dropped).toEqual(["ghost"]);
  });
});

describe("id fields survive redaction", () => {
  // Regression: UUID masking rewrote canonicalThreatId to "[id]", which then
  // failed restrictIds and silently dropped every correct match — a live run
  // reported "matched 0 of 7" for a learner who had named four correctly.
  it("never masks ids inside structured id fields", () => {
    const id = "d3a94258-4e5d-43a7-81da-81056884bdec";
    const { value } = redactSecrets(
      {
        matchedThreats: [{ canonicalThreatId: id, learnerText: "session theft", confidence: 0.9, reason: "ok" }],
        missingThreatIds: [id],
        items: [{ threatId: id, mitigationId: id, isCorrect: true, explanation: "fine" }],
      },
      [],
    );
    expect(value.matchedThreats[0]!.canonicalThreatId).toBe(id);
    expect(value.missingThreatIds).toEqual([id]);
    expect(value.items[0]!.threatId).toBe(id);
  });

  it("still masks ids that leak into prose", () => {
    const { value } = redactSecrets({ feedback: "see 71d7724c-02c9-49cc-82cb-b1d9e673d600" }, []);
    expect(value.feedback).toBe("see [id]");
  });

  it("keeps a match object whose reason quoted a description", () => {
    const DESC = "An attacker with read access to the session cache can lift a live session identifier.";
    const { value } = redactSecrets(
      { matchedThreats: [{ canonicalThreatId: "a", learnerText: "x", confidence: 1, reason: DESC }] },
      [DESC],
    );
    expect(value.matchedThreats).toHaveLength(1);
    expect(value.matchedThreats[0]!.reason).toBe("");
  });
});

/**
 * These run against `src`, but the API loads `shared/dist` at runtime. A green
 * suite therefore says nothing about the deployed behaviour unless shared has
 * been rebuilt — which is why `backend build` now depends on `shared build`.
 * This guard fails loudly if the built copy drifts from source.
 */
describe("built artifact matches source", () => {
  it("dist contains the id-field exemption", async () => {
    const fs = await import("node:fs");
    const url = new URL("../dist/schemas/ai.js", import.meta.url);
    if (!fs.existsSync(url)) return; // fresh clone, nothing built yet
    expect(fs.readFileSync(url, "utf8")).toContain("ID_KEY_RE");
  });
});
