import { describe, expect, it } from "vitest";
import { PointsService, type PointCandidate } from "../src/modules/points/points.service";
import type { PrismaService } from "../src/modules/prisma/prisma.service";

/**
 * `cheersFor` touches no injected dependency, so it's tested directly without
 * a Prisma double. The dedupe guarantee that actually matters — one award per
 * (attemptId, reason, refId), ever — lives in the migration's unique
 * constraint (see 20260806123653_add_points_gamification) and is exercised
 * live in the end-to-end verification, not mocked here.
 */
const points = new PointsService(undefined as unknown as PrismaService);

describe("PointsService.cheersFor", () => {
  const c = (reason: PointCandidate["reason"], refId: string): PointCandidate => ({
    reason,
    refId,
    amount: 10,
  });

  it("produces one cheer per correct answer", () => {
    const cheers = points.cheersFor([c("threat_matched", "a"), c("threat_matched", "b")]);
    expect(cheers).toHaveLength(2);
  });

  it("caps at 3 so a big correct step doesn't wall the learner in toasts", () => {
    const many = Array.from({ length: 10 }, (_, i) => c("mitigation_correct", String(i)));
    expect(points.cheersFor(many)).toHaveLength(3);
  });

  it("never cheers flat participation awards — nothing was 'correct' there", () => {
    const cheers = points.cheersFor([c("architecture_submitted", "single"), c("release_submitted", "single")]);
    expect(cheers).toHaveLength(0);
  });

  it("returns nothing for an empty award list", () => {
    expect(points.cheersFor([])).toEqual([]);
  });
});
