import { z } from "zod";
import {
  labDifficultySchema,
  labSeedSchema,
  priorityLevelSchema,
  releaseDecisionSchema,
  validateSeedReferences,
  type LabSeed,
} from "./lab";

/**
 * Custom Playground contracts (PLAYGROUND_PROJECT.md).
 *
 * A playground scenario is AI-generated, learner-owned practice content — it
 * never touches the curated catalog, the leaderboard, or org progress
 * reporting. The validation strategy below deliberately reuses the curated
 * seed-file machinery rather than inventing a second one: an AI-authored
 * scenario and a hand-written seed file have the same shape of risk (a typo'd
 * cross-reference that silently makes a step ungradeable), so they get the
 * same hard-reject treatment.
 */

/** Request body for POST /playground/sessions/:sessionId/scenarios.
 *  `prompt` is UNTRUSTED learner text — capped here so it can never dominate
 *  the generator prompt regardless of what the controller does with it. */
export const generateScenarioRequestSchema = z.object({
  prompt: z.string().min(20).max(2000),
  difficulty: labDifficultySchema.optional(),
});
export type GenerateScenarioRequest = z.infer<typeof generateScenarioRequestSchema>;

export const playgroundJobStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export type PlaygroundJobStatus = z.infer<typeof playgroundJobStatusSchema>;

export const generationJobSchema = z.object({
  jobId: z.string(),
  status: playgroundJobStatusSchema,
  scenarioId: z.string().nullable().default(null),
  /** Learner-safe text only. Never model output, never the validator's error list. */
  error: z.string().nullable().default(null),
});
export type GenerationJob = z.infer<typeof generationJobSchema>;

/**
 * What the generator model must return: `labSeedSchema` minus the routing
 * metadata the platform assigns (category, slug, version) — the model
 * authors content, not catalog placement.
 */
export const playgroundScenarioDraftSchema = labSeedSchema.omit({ category: true }).extend({
  lab: labSeedSchema.shape.lab.omit({ slug: true, version: true }),
});
export type PlaygroundScenarioDraft = z.infer<typeof playgroundScenarioDraftSchema>;

/**
 * What lands in `playground_generated_scenarios.content_json`: the draft with
 * a real UUID minted for every author-supplied key. UUIDs are required
 * because the learner-facing submission schemas
 * (`prioritizationSubmissionSchema`, `mitigationsSubmissionSchema`) enforce
 * `z.string().uuid()` on the ids the learner posts back — a generated scenario
 * has to speak the same id dialect as a curated one downstream.
 *
 * Re-parsed on every read despite being written once: the column is JSONB, so
 * a malformed row must fail loudly at the read site, not deep inside a
 * grading loop.
 */
export const playgroundScenarioContentSchema = z.object({
  lab: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    businessContext: z.string().min(1),
    systemContext: z.string().min(1),
    difficulty: labDifficultySchema,
    estimatedMinutes: z.number().int().positive(),
  }),
  architectureIssues: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
      affectedNodeIds: z.array(z.string()).default([]),
      affectedEdgeIds: z.array(z.string()).default([]),
      hint: z.string().nullable().default(null),
    }),
  ),
  threats: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
      category: z.string(),
      expectedPriority: priorityLevelSchema,
      affectedNodeIds: z.array(z.string()).default([]),
      affectedEdgeIds: z.array(z.string()).default([]),
      acceptedAliases: z.array(z.string()).default([]),
      learnerExplanation: z.string().nullable().default(null),
      sortOrder: z.number().int().default(0),
    }),
  ),
  mitigations: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
      sortOrder: z.number().int().default(0),
    }),
  ),
  threatMitigations: z.array(
    z.object({
      threatId: z.string().uuid(),
      mitigationId: z.string().uuid(),
      isPrimary: z.boolean().default(true),
      explanation: z.string().nullable().default(null),
    }),
  ),
  releaseGuidance: z.object({
    recommendedDecision: releaseDecisionSchema,
    rationale: z.string(),
    suggestedConditions: z.array(z.string()).default([]),
  }),
});
export type PlaygroundScenarioContent = z.infer<typeof playgroundScenarioContentSchema>;

/* -------------------------------------------------------- generation gate */

/** Size bounds. These are what keep every DOWNSTREAM coaching prompt inside
 *  AI_MAX_INPUT_TOKENS — an unbounded DFD would blow the budget on all five
 *  workflow steps, not just generation. */
export const SCENARIO_BOUNDS = {
  nodes: [4, 25],
  edges: [3, 40],
  threats: [3, 12],
  mitigations: [3, 20],
  architectureIssues: [2, 10],
  maxSerializedChars: 60_000,
} as const;

/**
 * The generated-content gate. Wraps `validateSeedReferences` — which already
 * checks unknown node/edge references on issues and threats, unknown
 * threat/mitigation keys, that every threat has at least one mitigation, and
 * duplicate keys — and adds only the bounds a hand-written curated seed never
 * violates but an unattended model can.
 *
 * `sentinel` is a distinctive phrase from the generator's system prompt; if it
 * appears anywhere in the output, the model echoed its own instructions,
 * which means the untrusted request steered it. That is a reject, not
 * something to sanitize around.
 */
export function validateGeneratedScenario(draft: PlaygroundScenarioDraft, sentinel: string): string[] {
  // Hydrate the routing metadata the model was never asked for, so the
  // curated validator can run completely unchanged.
  const seed: LabSeed = {
    ...draft,
    category: { name: "Playground", slug: "playground", description: "", sortOrder: 0 },
    lab: { ...draft.lab, slug: "pg-validation", version: 1 },
  };
  const errors = validateSeedReferences(seed);

  const range = (label: string, n: number, [lo, hi]: readonly [number, number]) => {
    if (n < lo) errors.push(`${label}: ${n} is below the minimum of ${lo}`);
    if (n > hi) errors.push(`${label}: ${n} exceeds the maximum of ${hi}`);
  };
  range("dfd.nodes", draft.dfd.nodes.length, SCENARIO_BOUNDS.nodes);
  range("dfd.edges", draft.dfd.edges.length, SCENARIO_BOUNDS.edges);
  range("threats", draft.threats.length, SCENARIO_BOUNDS.threats);
  range("mitigations", draft.mitigations.length, SCENARIO_BOUNDS.mitigations);
  range("architectureIssues", draft.architectureIssues.length, SCENARIO_BOUNDS.architectureIssues);

  const serialized = JSON.stringify(draft);
  if (serialized.length > SCENARIO_BOUNDS.maxSerializedChars) {
    errors.push(`scenario is ${serialized.length} chars, over the ${SCENARIO_BOUNDS.maxSerializedChars} limit`);
  }
  if (sentinel && serialized.includes(sentinel)) {
    errors.push("output echoed the generator instructions");
  }
  return errors;
}
