# Runbooks

## NIM is down / AI feedback missing

**Symptom:** learners see "your answer is saved, but the AI coach is
unavailable"; `aiStatus` is `unavailable`.

This is a degraded state, not an outage. Answers are committed before the AI
call, so nothing is lost and the lab remains completable.

1. `curl $API/api/v1/health/dependencies` — check the `nim` block.
2. `pnpm nim:smoke` — is it the whole provider or one model?
3. If one model is failing, override that tier in the environment
   (`NVIDIA_NIM_MODEL_REASONING=…`) and restart. `AiService` already falls back
   through the other tiers automatically, so this is only needed when the
   primary is persistently bad.
4. Record the change in `docs/ai-rules.md`.

## A model starts returning unparseable JSON

`AiService` logs `AI response failed schema validation` and falls through to the
next model. If the primary is consistently bad, demote it via the env override.
Check `ai_calls` for the rate:

```sql
SELECT model_id, status, count(*) FROM ai_calls
WHERE created_at > now() - interval '1 hour' GROUP BY 1, 2 ORDER BY 3 DESC;
```

## Suspected answer-key leak

1. Confirm against the live API — the response must contain no `threats`,
   `architectureIssues`, `threatMitigations` or `releaseGuidance`:
   ```bash
   curl -s $API/api/v1/labs/<slug> | python3 -m json.tool
   ```
2. The redaction is structural (Prisma `select` in `CatalogService`), so a leak
   means a new `include` was added. Check that first.
3. `revealedThreats` is only populated by the threats step after the retry
   limit; it must never appear on a catalog route.

## Rotating the NVIDIA key

1. Issue a new key in the NVIDIA console.
2. Update the platform secret store, then `NVIDIA_NIM_API_KEY`.
3. `pnpm nim:smoke` against the new key.
4. Revoke the old key.
5. The key is only ever read by `NimClient` and is never logged.

## Publishing a lab change

Published labs are immutable. Editing a seed file and re-running `db:seed`
creates a **new version** and archives the old one; in-flight attempts keep the
content they started with, because `lab_attempts` pins `lab_version` and
`lab_content_hash`.

```bash
pnpm --filter @curated-labs/backend db:seed
```

The seed validates schema and cross-references before writing anything, so a
broken answer key fails the run rather than half-loading.

## A user must be disabled

```sql
UPDATE users SET disabled_at = now() WHERE email = '…';
UPDATE sessions SET revoked_at = now() WHERE user_id = '…';
```

`SessionService.resolve` rejects both conditions on the next request.

## Database restore

Migrations are forward-only and committed under
`backend/prisma/migrations`. To rebuild an environment:

```bash
pnpm --filter @curated-labs/backend db:deploy
pnpm --filter @curated-labs/backend db:seed
```

Restoring learner data requires a Postgres dump — set that up before launch; it
is on the outstanding list.
