# Curated Labs

AI-assisted threat modeling training platform. Learners work through curated
labs — read a DFD, find the architecture issues, name the threats, prioritise
them, match mitigations, and make a release call — with NVIDIA NIM as a coach.

No grades, no scores, no leaderboards. Progress is activity, not achievement.

## Layout

```
frontend/   Next.js App Router — pages, DFD viewer, lab workflow UI
backend/    NestJS + Fastify API, Prisma schema, migrations, lab seeds
shared/     Zod contracts, RBAC matrix, AI output schemas — used by both
scripts/    NVIDIA NIM model inspection and smoke tests
docs/       architecture, api, ai-rules, runbooks
```

Frontend and backend are separate packages with no imports between them; they
meet only at `shared/`, which owns the wire contracts and the permission table.

## Running locally

```bash
pnpm install
pnpm --filter @curated-labs/shared build     # shared compiles to JS first

cp .env.example .env                          # then fill in the secrets
pnpm --filter @curated-labs/backend db:deploy # apply migrations
pnpm --filter @curated-labs/backend db:seed   # load curated labs

pnpm dev                                      # frontend :3000 + backend :4000
```

### PostgreSQL

There is no Docker in this project — bring your own PostgreSQL 16+. On macOS:

```bash
brew install postgresql@15 && brew services start postgresql@15
createdb curated_labs
psql -d curated_labs -c 'CREATE EXTENSION IF NOT EXISTS citext;
                         CREATE EXTENSION IF NOT EXISTS pgcrypto;
                         CREATE EXTENSION IF NOT EXISTS pg_trgm;'
```

Then point `DATABASE_URL` at it. A hosted database (Neon, Supabase) works the
same way — all three extensions are available on their free tiers.

### Signing in

Production uses Google OIDC only; there is no password path anywhere in the
codebase. For local work without Google credentials, set `ALLOW_DEV_LOGIN=true`
and POST to `/api/v1/auth/dev-login`. The API refuses to start with that flag
set when `NODE_ENV=production`.

## NVIDIA NIM

```bash
pnpm nim:inspect   # models the key can see
pnpm nim:smoke     # models that actually work, with latencies
```

Model selection is measured, not guessed — several models the spec's name
heuristic would pick are 404 or time out on this key. Selections, rejections
and the reasoning: [docs/ai-rules.md](docs/ai-rules.md).

## Verification

```bash
pnpm -r typecheck
pnpm -r test
pnpm build
```

## Secrets

The NVIDIA key from `project.md` line 1 is in `.env`, which is gitignored.
That key is in plaintext in a tracked document — **rotate it** before this repo
goes anywhere shared.
