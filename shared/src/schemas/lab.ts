import { z } from "zod";
import { dfdGraphSchema } from "./dfd";

export const labDifficultySchema = z.enum(["beginner", "intermediate", "advanced"]);
export const labStatusSchema = z.enum(["draft", "review", "published", "archived"]);
export const priorityLevelSchema = z.enum(["critical", "high", "medium", "low"]);
export const releaseDecisionSchema = z.enum(["ship_it", "ship_with_conditions", "do_not_ship"]);

/**
 * The 12 threat categories every canonical and generated threat is
 * classified under. The first 6 are STRIDE, unchanged from the original
 * seed data. The remaining 6 extend it to cover the ground STRIDE doesn't:
 * architectural flaws below the level of a single spoof/tamper/etc., cloud
 * misconfiguration, third-party/dependency risk, privacy, AI/ML-specific
 * abuse, and identity/access failures broader than pure privilege
 * escalation: chosen to match this platform's own lab categories
 * (App Security, Cloud Security, AI Security, Privacy).
 */
export const THREAT_CATEGORIES = [
  "Spoofing",
  "Tampering",
  "Repudiation",
  "Information disclosure",
  "Denial of service",
  "Elevation of privilege",
  "Insecure design",
  "Security misconfiguration",
  "Supply chain risk",
  "Privacy violation",
  "AI model abuse",
  "Identity and access management failure",
] as const;
export const threatCategorySchema = z.enum(THREAT_CATEGORIES);
export type ThreatCategory = z.infer<typeof threatCategorySchema>;

/** PROJECT.md. Order matters: `stepIndex` derives progression from it. */
export const LAB_STEPS = [
  "intro",
  "architecture_issues",
  "attack_surfaces",
  "threats",
  "prioritization",
  "mitigations",
  "release_decision",
  "completed",
] as const;
export const labStepSchema = z.enum(LAB_STEPS);
export type LabStep = z.infer<typeof labStepSchema>;

export function stepIndex(step: LabStep): number {
  return LAB_STEPS.indexOf(step);
}
export function nextStep(step: LabStep): LabStep {
  return LAB_STEPS[Math.min(stepIndex(step) + 1, LAB_STEPS.length - 1)]!;
}

/* ---------------------------------------------------------------- seed files */

export const labSeedSchema = z.object({
  category: z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().default(""),
    sortOrder: z.number().int().default(0),
  }),
  lab: z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    summary: z.string().min(1),
    businessContext: z.string().min(1),
    systemContext: z.string().min(1),
    difficulty: labDifficultySchema,
    estimatedMinutes: z.number().int().positive(),
    version: z.number().int().positive().default(1),
  }),
  dfd: dfdGraphSchema,
  architectureIssues: z.array(
    z.object({
      key: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      affectedNodeIds: z.array(z.string()).default([]),
      affectedEdgeIds: z.array(z.string()).default([]),
      hint: z.string().optional(),
    }),
  ),
  threats: z.array(
    z.object({
      key: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      category: threatCategorySchema,
      expectedPriority: priorityLevelSchema,
      affectedNodeIds: z.array(z.string()).default([]),
      affectedEdgeIds: z.array(z.string()).default([]),
      acceptedAliases: z.array(z.string()).default([]),
      learnerExplanation: z.string().optional(),
    }),
  ),
  mitigations: z.array(
    z.object({
      key: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
  threatMitigations: z.array(
    z.object({
      threatKey: z.string().min(1),
      mitigationKey: z.string().min(1),
      isPrimary: z.boolean().default(true),
      explanation: z.string().optional(),
    }),
  ),
  releaseGuidance: z.object({
    recommendedDecision: releaseDecisionSchema,
    rationale: z.string().min(1),
    suggestedConditions: z.array(z.string()).default([]),
  }),
});

export type LabSeed = z.infer<typeof labSeedSchema>;

/**
 * Seed files use human-readable keys instead of UUIDs, so the cross-references
 * have to be checked before insert: a typo would otherwise become a silently
 * missing answer key that only surfaces when a learner reaches step 4.
 */
export function validateSeedReferences(seed: LabSeed): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(seed.dfd.nodes.map((n) => n.id));
  const edgeIds = new Set(seed.dfd.edges.map((e) => e.id));
  const threatKeys = new Set(seed.threats.map((t) => t.key));
  const mitigationKeys = new Set(seed.mitigations.map((m) => m.key));

  const checkRefs = (label: string, nodes: string[], edges: string[]) => {
    for (const id of nodes) if (!nodeIds.has(id)) errors.push(`${label}: unknown node "${id}"`);
    for (const id of edges) if (!edgeIds.has(id)) errors.push(`${label}: unknown edge "${id}"`);
  };

  for (const issue of seed.architectureIssues) {
    checkRefs(`architectureIssue ${issue.key}`, issue.affectedNodeIds, issue.affectedEdgeIds);
  }
  for (const threat of seed.threats) {
    checkRefs(`threat ${threat.key}`, threat.affectedNodeIds, threat.affectedEdgeIds);
  }
  for (const link of seed.threatMitigations) {
    if (!threatKeys.has(link.threatKey)) errors.push(`threatMitigation: unknown threat "${link.threatKey}"`);
    if (!mitigationKeys.has(link.mitigationKey)) {
      errors.push(`threatMitigation: unknown mitigation "${link.mitigationKey}"`);
    }
  }
  // Every threat needs at least one mitigation or step 4 cannot be scored.
  for (const threat of seed.threats) {
    if (!seed.threatMitigations.some((m) => m.threatKey === threat.key)) {
      errors.push(`threat ${threat.key} has no mitigation mapping`);
    }
  }
  // Every node needs a trust zone, or the diagram reads as unfinished next
  // to every other lab. Enforced here (not just requested in the generator
  // prompt) so a scenario the model half-completes gets rejected outright
  // rather than shipping with an unassigned node.
  for (const node of seed.dfd.nodes) {
    if (!node.trustBoundary) errors.push(`node ${node.id} has no trustBoundary assigned`);
  }
  if (seed.dfd.nodes.length > 0 && seed.dfd.trustBoundaries.length === 0) {
    errors.push("dfd has nodes but no trustBoundaries defined");
  }
  const duplicateKeys = (keys: string[]) => keys.filter((k, i) => keys.indexOf(k) !== i);
  for (const dup of duplicateKeys(seed.threats.map((t) => t.key))) errors.push(`duplicate threat key "${dup}"`);
  for (const dup of duplicateKeys(seed.mitigations.map((m) => m.key))) {
    errors.push(`duplicate mitigation key "${dup}"`);
  }
  return errors;
}
