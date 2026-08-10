import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { labSeedSchema, validateSeedReferences, type LabSeed, compileToDrawioXml } from "@curated-labs/shared";

/**
 * Loads curated labs from JSON (§18). Validated with Zod plus cross-reference
 * checks before a single row is written, so a typo in an answer key fails the
 * seed rather than surfacing as a broken lab in step 4.
 *
 * Re-runnable: labs are keyed by (slug, version). An unchanged file is skipped;
 * a changed one is published as a new version, because published labs are
 * immutable and in-flight attempts must keep the content they started with.
 */
const prisma = new PrismaClient();
// Resolved from cwd rather than import.meta: the backend compiles to CommonJS
// and this script is always run from the backend package root.
const labsDir = join(process.cwd(), "prisma", "seed", "labs");

function contentHash(seed: LabSeed): string {
  return createHash("sha256").update(JSON.stringify(seed)).digest("hex").slice(0, 32);
}

async function seedLab(seed: LabSeed) {
  const hash = contentHash(seed);

  const existing = await prisma.lab.findFirst({
    where: { slug: seed.lab.slug },
    orderBy: { version: "desc" },
  });
  if (existing?.contentHash === hash) {
    console.log(`  = ${seed.lab.slug} v${existing.version} unchanged`);
    return;
  }
  const version = existing ? existing.version + 1 : seed.lab.version;
  if (existing) console.log(`  ~ ${seed.lab.slug} changed, publishing v${version}`);

  const category = await prisma.labCategory.upsert({
    where: { slug: seed.category.slug },
    create: {
      name: seed.category.name,
      slug: seed.category.slug,
      description: seed.category.description,
      sortOrder: seed.category.sortOrder,
    },
    update: { name: seed.category.name, description: seed.category.description },
  });

  await prisma.$transaction(async (tx) => {
    const lab = await tx.lab.create({
      data: {
        categoryId: category.id,
        title: seed.lab.title,
        slug: seed.lab.slug,
        summary: seed.lab.summary,
        businessContext: seed.lab.businessContext,
        systemContext: seed.lab.systemContext,
        difficulty: seed.lab.difficulty,
        estimatedMinutes: seed.lab.estimatedMinutes,
        status: "published",
        version,
        contentHash: hash,
        supersedesLabId: existing?.id ?? null,
        publishedAt: new Date(),
      },
    });

    await tx.labDfd.create({ data: { labId: lab.id, version: 1, drawioXml: compileToDrawioXml(seed.dfd) } });

    await tx.labArchitectureIssue.createMany({
      data: seed.architectureIssues.map((issue, i) => ({
        labId: lab.id,
        title: issue.title,
        description: issue.description,
        affectedNodeIds: issue.affectedNodeIds,
        affectedEdgeIds: issue.affectedEdgeIds,
        hint: issue.hint ?? null,
        sortOrder: i,
      })),
    });

    // Seeds use readable keys; the database uses UUIDs. Keep the mapping so the
    // threat→mitigation join can be rebuilt after insert.
    const threatIds = new Map<string, string>();
    for (const [i, threat] of seed.threats.entries()) {
      const row = await tx.labThreat.create({
        data: {
          labId: lab.id,
          title: threat.title,
          description: threat.description,
          category: threat.category,
          expectedPriority: threat.expectedPriority,
          affectedNodeIds: threat.affectedNodeIds,
          affectedEdgeIds: threat.affectedEdgeIds,
          acceptedAliases: threat.acceptedAliases,
          learnerExplanation: threat.learnerExplanation ?? null,
          sortOrder: i,
        },
      });
      threatIds.set(threat.key, row.id);
    }

    const mitigationIds = new Map<string, string>();
    for (const [i, mitigation] of seed.mitigations.entries()) {
      const row = await tx.labMitigation.create({
        data: { labId: lab.id, title: mitigation.title, description: mitigation.description, sortOrder: i },
      });
      mitigationIds.set(mitigation.key, row.id);
    }

    await tx.labThreatMitigation.createMany({
      data: seed.threatMitigations.map((link) => ({
        threatId: threatIds.get(link.threatKey)!,
        mitigationId: mitigationIds.get(link.mitigationKey)!,
        isPrimary: link.isPrimary,
        explanation: link.explanation ?? null,
      })),
    });

    await tx.labReleaseGuidance.create({
      data: {
        labId: lab.id,
        recommendedDecision: seed.releaseGuidance.recommendedDecision,
        rationale: seed.releaseGuidance.rationale,
        suggestedConditions: seed.releaseGuidance.suggestedConditions,
      },
    });

    // Retire the previous version so the catalog shows one row per slug.
    if (existing) {
      await tx.lab.update({ where: { id: existing.id }, data: { status: "archived" } });
    }
  }, {
    /*
     * One lab is ~20 statements, and this has to stay a single transaction so a
     * partially-written lab can never reach the catalog.
     *
     * Prisma's 5 s default assumes a local database. A hosted one (Neon here)
     * adds ~370 ms per round trip, which puts a whole lab well past the limit
     * and fails with P2028 — the transaction closes underneath the seed.
     */
    timeout: 120_000,
    maxWait: 20_000,
  });

  console.log(`  + ${seed.lab.slug} v${version} (${seed.threats.length} threats, ${seed.mitigations.length} mitigations)`);
}

async function main() {
  const files = readdirSync(labsDir).filter((f) => f.endsWith(".json"));
  if (!files.length) throw new Error(`No lab seed files in ${labsDir}`);

  console.log(`Seeding ${files.length} lab(s)...`);
  const seeds: LabSeed[] = [];

  // Validate everything before writing anything — a partial seed is worse than
  // no seed, because half a lab still renders.
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(labsDir, file), "utf8"));
    const parsed = labSeedSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(`✗ ${file} failed schema validation:`);
      for (const issue of parsed.error.issues) console.error(`    ${issue.path.join(".")}: ${issue.message}`);
      process.exitCode = 1;
      return;
    }
    const refErrors = validateSeedReferences(parsed.data);
    if (refErrors.length) {
      console.error(`✗ ${file} has broken references:`);
      for (const e of refErrors) console.error(`    ${e}`);
      process.exitCode = 1;
      return;
    }
    seeds.push(parsed.data);
  }

  for (const seed of seeds) await seedLab(seed);
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
