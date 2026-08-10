-- PROJECT.md §10 fixes the physical column names. `currentStep` was created
-- camelCase because the model was missing an @map; rename it to match the spec.
ALTER TABLE "lab_attempts" RENAME COLUMN "currentStep" TO "current_step";
