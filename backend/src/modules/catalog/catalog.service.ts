import { Injectable, NotFoundException } from "@nestjs/common";
import { extractFromDrawioXml, isUuid, type LabDetail, type LabSummary } from "@curated-labs/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthContext } from "../../common/guards/session.guard";

/**
 * Published catalog (§17).
 *
 * The redaction rule from §28 is enforced by construction: the Prisma `select`
 * clauses below never load architecture issues, canonical threats, or the
 * threat→mitigation mapping. Mitigation *titles* are needed to render step 4's
 * options, so those are returned — the mapping that makes them answers is not.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Categories with the caller's completion count, so the catalog can show
   * "2 of 3 done" per category. One extra query rather than one per category.
   */
  async listCategories(user?: AuthContext) {
    const categories = await this.prisma.labCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { labs: { where: { status: "published" } } } },
        labs: { where: { status: "published" }, select: { id: true } },
      },
    });

    const completedLabIds = user
      ? new Set(
          (
            await this.prisma.labAttempt.findMany({
              where: { userId: user.userId, status: "completed" },
              select: { labId: true },
            })
          ).map((a) => a.labId),
        )
      : new Set<string>();

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      labCount: c._count.labs,
      completedCount: c.labs.filter((l) => completedLabIds.has(l.id)).length,
    }));
  }

  async listLabs(user: AuthContext | undefined, filter: { categorySlug?: string }): Promise<LabSummary[]> {
    const labs = await this.prisma.lab.findMany({
      where: {
        status: "published",
        ...(filter.categorySlug ? { category: { slug: filter.categorySlug } } : {}),
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { title: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        difficulty: true,
        estimatedMinutes: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    // Resume state for signed-in learners, in one query rather than N.
    const attempts = user
      ? await this.prisma.labAttempt.findMany({
          where: { userId: user.userId, labId: { in: labs.map((l) => l.id) } },
          orderBy: { startedAt: "desc" },
          select: { id: true, labId: true, status: true, currentStep: true },
        })
      : [];
    const latest = new Map<string, (typeof attempts)[number]>();
    for (const a of attempts) if (!latest.has(a.labId)) latest.set(a.labId, a);

    return labs.map((lab) => {
      const attempt = latest.get(lab.id);
      return {
        ...lab,
        attempt: attempt
          ? { id: attempt.id, status: attempt.status, currentStep: attempt.currentStep }
          : null,
      };
    });
  }

  /** Learner-facing detail. Answer keys are absent from the selection itself. */
  async getLab(user: AuthContext | undefined, slugOrId: string): Promise<LabDetail> {
    const lab = await this.prisma.lab.findFirst({
      where: {
        status: "published",
        // Accept either a slug or a UUID so links stay readable.
        OR: [{ slug: slugOrId }, ...(isUuid(slugOrId) ? [{ id: slugOrId }] : [])],
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        businessContext: true,
        systemContext: true,
        difficulty: true,
        estimatedMinutes: true,
        version: true,
        category: { select: { id: true, name: true, slug: true } },
        dfds: { orderBy: { version: "desc" }, take: 1, select: { drawioXml: true, version: true } },
        mitigations: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, title: true, description: true },
        },
      },
    });
    if (!lab) throw new NotFoundException("Lab not found.");

    const dfd = lab.dfds[0];
    if (!dfd) throw new NotFoundException("This lab has no diagram yet.");

    const attempt = user
      ? await this.prisma.labAttempt.findFirst({
          where: { userId: user.userId, labId: lab.id },
          orderBy: { startedAt: "desc" },
          select: { id: true, status: true, currentStep: true },
        })
      : null;

    return {
      id: lab.id,
      slug: lab.slug,
      title: lab.title,
      summary: lab.summary,
      businessContext: lab.businessContext,
      systemContext: lab.systemContext,
      difficulty: lab.difficulty,
      estimatedMinutes: lab.estimatedMinutes,
      version: lab.version,
      category: lab.category,
      // Re-validate on the way out: the column is JSONB and a bad seed or a
      // manual edit should fail here, not inside the renderer.
      dfd: extractFromDrawioXml(dfd.drawioXml),
      dfdVersion: dfd.version,
      mitigationOptions: lab.mitigations,
      attempt,
    };
  }

  async getDfd(slugOrId: string) {
    const lab = await this.getLab(undefined, slugOrId);
    return { labId: lab.id, version: lab.dfdVersion, graph: lab.dfd };
  }
}

