import { z } from "zod";

/**
 * Gamification (points + leaderboard).
 *
 * Added at the user's explicit direction, overriding PROJECT.md §1's "Do Not
 * Build: marks, grades, leaderboards" — flagged before building, decision was
 * to build the full public version anyway. Points reward the same signals the
 * coach already computes deterministically (matched threats, correct
 * priorities, correct mitigation pairs); nothing here changes what the AI
 * evaluates or exposes, it only scores what step 2–4 already scored.
 */

export const POINT_REASONS = [
  "architecture_submitted",
  "attack_surface_identified",
  "threat_matched",
  "threats_clean_sweep",
  "priority_correct",
  "mitigation_correct",
  "release_submitted",
  "lab_completed",
] as const;
export const pointReasonSchema = z.enum(POINT_REASONS);
export type PointReason = z.infer<typeof pointReasonSchema>;

/**
 * Point values. Weighted toward step 4 (mitigations), the only step §8 allows
 * to be explicitly right/wrong — steps 1 and 5 pay a flat participation amount
 * since there is no correctness signal to reward there without inventing one
 * the AI doesn't actually compute.
 */
export const POINTS: Record<PointReason, number> = {
  architecture_submitted: 5,
  attack_surface_identified: 8,
  threat_matched: 10,
  threats_clean_sweep: 20,
  priority_correct: 10,
  mitigation_correct: 15,
  release_submitted: 5,
  lab_completed: 50,
};

export const leaderboardEntrySchema = z.object({
  userId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  points: z.number().int(),
  rank: z.number().int(),
  /** True for the row belonging to whoever asked for the board. */
  isSelf: z.boolean().default(false),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardResponseSchema = z.object({
  scope: z.enum(["global", "organization"]),
  entries: z.array(leaderboardEntrySchema),
  /** The caller's own row, present even when they fall outside the top N. */
  self: leaderboardEntrySchema.nullable(),
});
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;

export const myPointsResponseSchema = z.object({
  total: z.number().int(),
  recent: z.array(
    z.object({
      reason: pointReasonSchema,
      amount: z.number().int(),
      labTitle: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type MyPointsResponse = z.infer<typeof myPointsResponseSchema>;

/**
 * Cheer copy for a just-scored answer. Pure and deterministic (keyed off a
 * running count, not Math.random) so backend and frontend never disagree on
 * what was said, and a retried submission renders the same cheer instead of a
 * different random one.
 */
const CHEERS: Record<Exclude<PointReason, "architecture_submitted" | "release_submitted">, string[]> = {
  attack_surface_identified: ["That's an entry point.", "Right — untrusted input arrives there.", "Good, that one's exposed."],
  threat_matched: ["Nice catch.", "That's a real one.", "Good eye.", "Exactly right."],
  threats_clean_sweep: ["You found every threat here — clean sweep."],
  priority_correct: ["Good call on the priority.", "That ranking matches the risk.", "Right instinct."],
  mitigation_correct: ["Correct match.", "That's the right control for it.", "Nailed the pairing."],
  lab_completed: ["Lab complete — nice work."],
};

export function cheerFor(reason: keyof typeof CHEERS, occurrence: number): string {
  const options = CHEERS[reason];
  return options[occurrence % options.length]!;
}
