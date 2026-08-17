import { z } from "zod";
import { dfdGraphSchema } from "../schemas/dfd";
import {
  labDifficultySchema,
  labStepSchema,
  priorityLevelSchema,
  releaseDecisionSchema,
} from "../schemas/lab";
import { ORG_ROLES, PLATFORM_ROLES } from "../rbac/index";

/** Wire contracts shared by the API and the web app (PROJECT.md §11). */

export const API_PREFIX = "/api/v1";

export const errorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "AI_UNAVAILABLE",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** §25: one error envelope everywhere, always with a request id. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/* ------------------------------------------------------------------ auth */

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  platformRoles: z.array(z.enum(PLATFORM_ROLES)),
  organizations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      role: z.enum(ORG_ROLES),
    }),
  ),
  /** Null until the user picks individual or organization. Drives /onboarding. */
  accountKind: z.enum(["individual", "organization"]).nullable(),
  /** When true the learner is hidden from everyone else's leaderboard. They
   *  still see their own standing. */
  leaderboardOptOut: z.boolean().default(false),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/* ------------------------------------------------------------ onboarding */

export const createOrganizationRequestSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, digits and hyphens only"),
});

export const acceptInvitationRequestSchema = z.object({ token: z.string().min(16) });

/* --------------------------------------------------------- organizations */

export const createDepartmentRequestSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  parentDepartmentId: z.string().uuid().nullable().optional(),
});

export const createInvitationRequestSchema = z.object({
  email: z.string().email(),
  role: z.enum(ORG_ROLES).default("learner"),
  departmentId: z.string().uuid().nullable().optional(),
});

export const updateMemberRequestSchema = z.object({ role: z.enum(ORG_ROLES) });

/* -------------------------------------------------------------- catalog */

export const labSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  difficulty: labDifficultySchema,
  estimatedMinutes: z.number().int(),
  category: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  /** Present when the caller already has an attempt on this lab. */
  attempt: z
    .object({ id: z.string(), status: z.string(), currentStep: labStepSchema })
    .nullable()
    .default(null),
});
export type LabSummary = z.infer<typeof labSummarySchema>;

/**
 * Learner-facing lab detail. Deliberately has no field for canonical threats,
 * architecture issues or mitigation answer keys — §28 forbids shipping them
 * before reveal state, and the type makes that a compile error, not a review
 * comment. Revealed content arrives separately via the threats step response.
 */
export const labDetailSchema = labSummarySchema.extend({
  businessContext: z.string(),
  systemContext: z.string(),
  version: z.number().int(),
  dfd: dfdGraphSchema,
  dfdVersion: z.number().int(),
  /** Titles only, so step 4 can render options without leaking the mapping. */
  mitigationOptions: z.array(z.object({ id: z.string(), title: z.string(), description: z.string() })),
});
export type LabDetail = z.infer<typeof labDetailSchema>;

/* ------------------------------------------------------------- attempts */

/**
 * Free-text answers are trimmed before length is checked, so whitespace can
 * never satisfy a minimum. Reported from real use as "I entered two threats
 * and kept the next one blank. It accepted a blank threat" — the UI drops
 * empty rows, but the API itself would have taken a single space.
 */
const answerText = (max: number) => z.string().trim().min(1).max(max);

export const architectureIssuesSubmissionSchema = z.object({
  text: answerText(8000),
  referencedNodeIds: z.array(z.string()).default([]),
  referencedEdgeIds: z.array(z.string()).default([]),
});

/**
 * Attack surfaces are picked off the diagram, not typed — the learner selects
 * the nodes and flows where untrusted input enters, and explains why. Grading
 * is on the selection; the prose is what the coach responds to.
 */
export const attackSurfacesSubmissionSchema = z.object({
  text: answerText(4000),
  referencedNodeIds: z.array(z.string()).default([]),
  referencedEdgeIds: z.array(z.string()).default([]),
});

export const threatsSubmissionSchema = z.object({
  threats: z.array(answerText(1000)).min(1).max(40),
  referencedNodeIds: z.array(z.string()).default([]),
  referencedEdgeIds: z.array(z.string()).default([]),
});

export const prioritizationSubmissionSchema = z.object({
  items: z
    .array(
      z.object({
        threatId: z.string().uuid(),
        priority: priorityLevelSchema,
        rationale: answerText(2000),
      }),
    )
    .min(1),
});

export const mitigationsSubmissionSchema = z.object({
  pairings: z
    .array(z.object({ threatId: z.string().uuid(), mitigationId: z.string().uuid() }))
    .min(1),
});

export const releaseDecisionSubmissionSchema = z.object({
  decision: releaseDecisionSchema,
  rationale: answerText(4000),
  conditions: z.string().trim().max(4000).optional(),
});

/** Every step returns the same envelope so the UI has one rendering path. */
export const stepResultSchema = z.object({
  submissionId: z.string(),
  attemptNumber: z.number().int(),
  currentStep: labStepSchema,
  /** Null when NIM was unavailable — the answer is still saved. §16 UX rule. */
  aiFeedback: z.unknown().nullable(),
  aiStatus: z.enum(["ok", "unavailable", "invalid"]),
  deterministicResult: z.unknown().nullable(),
  /** The full attack-surface set, returned after that step is submitted so
   *  the learner can compare against what they picked. Never sent earlier. */
  revealedAttackSurfaces: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["node", "edge"]),
        label: z.string(),
        reason: z.string(),
      }),
    )
    .nullable()
    .default(null),
  /** Populated only once the reveal rules in §8 step 2 allow it. */
  revealedThreats: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        category: z.string(),
        expectedPriority: priorityLevelSchema,
        learnerExplanation: z.string().nullable(),
      }),
    )
    .nullable()
    .default(null),
  /** 0 on a replayed idempotent submission — points are never awarded twice. */
  pointsAwarded: z.number().int().default(0),
  /** Short, pre-written lines for whatever this submission got right. Capped
   *  by the caller so one big correct step doesn't wall the learner in toasts. */
  cheers: z.array(z.string()).default([]),
});
export type StepResult = z.infer<typeof stepResultSchema>;

export const attemptSchema = z.object({
  id: z.string(),
  labId: z.string(),
  labVersion: z.number().int(),
  status: z.enum(["in_progress", "completed", "abandoned"]),
  currentStep: labStepSchema,
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  submissions: z.array(
    z.object({
      id: z.string(),
      step: labStepSchema,
      attemptNumber: z.number().int(),
      answer: z.unknown(),
      aiFeedback: z.unknown().nullable(),
      deterministicResult: z.unknown().nullable(),
      submittedAt: z.string(),
    }),
  ),
});
export type Attempt = z.infer<typeof attemptSchema>;

export const progressSchema = z.object({
  labsStarted: z.number().int(),
  labsCompleted: z.number().int(),
  stepsSubmitted: z.number().int(),
  recent: z.array(
    z.object({
      attemptId: z.string(),
      labTitle: z.string(),
      labSlug: z.string(),
      status: z.string(),
      currentStep: labStepSchema,
      startedAt: z.string(),
    }),
  ),
});
export type Progress = z.infer<typeof progressSchema>;

/* ------------------------------------------------------------ preferences */

export const updatePreferencesRequestSchema = z.object({
  leaderboardOptOut: z.boolean(),
});
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;
