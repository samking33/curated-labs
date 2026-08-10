-- AlterTable
-- graph_json -> drawio_xml is a storage-format change, not a value rename, so
-- there is no data-preserving cast Prisma (or we) can express. This project is
-- pre-production; the 9 existing lab_dfds rows get a placeholder empty string
-- so the NOT NULL constraint can be added, and Task 6's db:seed overwrites
-- every row's drawio_xml with real content immediately after.
ALTER TABLE "lab_dfds" ADD COLUMN "drawio_xml" TEXT;
UPDATE "lab_dfds" SET "drawio_xml" = '' WHERE "drawio_xml" IS NULL;
ALTER TABLE "lab_dfds" ALTER COLUMN "drawio_xml" SET NOT NULL;
ALTER TABLE "lab_dfds" DROP COLUMN "graph_json";

-- AlterTable
-- playground_generated_scenarios has 0 rows in this environment, so a plain
-- NOT NULL ADD COLUMN is executable as-is.
ALTER TABLE "playground_generated_scenarios" ADD COLUMN "dfd_xml" TEXT NOT NULL;
