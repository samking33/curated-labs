# Redis: deferred, and what it's for

PROJECT.md §3 lists Redis for "sessions, rate limits, queues, and idempotency
locks". It is **not installed**, and the app does not import a Redis client
anywhere. This is deliberate — three of those four needs were met without it,
and shipping a dependency nothing talks to invites someone to provision and pay
for an idle service.

That nearly happened: the hosting review flagged Redis as a required component
purely because `REDIS_URL` sat unread in the config schema. The config entry,
the `ioredis` dependency and the CI service container have all been removed.

## Where those four needs are met today

| Need | Current implementation | Good enough? |
|---|---|---|
| Sessions | `sessions` table, SHA-256 of the cookie token | **Yes.** Survives restarts, and revocation is a single `UPDATE`. Redis would be faster but not better. |
| Idempotency | `lab_step_submissions.idempotency_key`, unique per attempt | **Yes.** A retried submit returns the original row rather than re-billing an AI call. Postgres already enforces the uniqueness. |
| Queues | Not built — AI runs inline | **For now.** See below. |
| Rate limits | `@fastify/rate-limit`, in-process counters | **No — this is the weak one.** |

## What actually breaks without Redis

Two things, both only at more than one instance:

**1. Rate limiting is per-process.** Each instance keeps its own counters, so
N instances means N× the intended limit. On a single container this is correct;
the moment it scales horizontally the limit is advisory.

**2. Google OIDC login breaks.** `AuthService.pending` is an in-memory `Map`
holding the state, nonce and PKCE verifier between the redirect to Google and
the callback. If the callback lands on a different instance — or the process
restarted mid-login — the flow fails with "Sign-in request expired."

The second is the real blocker for horizontal scale, and it is worth knowing it
does **not** need Redis to fix: a small `oidc_pending` table with a TTL sweep
solves it with the database already in play.

## When to actually add Redis

Add it when one of these is true, not before:

- **More than one API instance.** Both problems above become real.
- **AI moves to background jobs.** §30 suggests async jobs for slow AI. Step 5
  measures ~20 s inline; if that becomes unacceptable, BullMQ needs Redis and
  that is the honest reason to bring it in.
- **Measured session-read pressure.** Every authenticated request resolves the
  session from Postgres. That is a single indexed lookup and has not been a
  problem, but it is the natural first cache.

## What to change when you do

1. Add `REDIS_URL` back to `backend/src/config/index.ts`.
2. Add `ioredis` to `backend/package.json`.
3. Point `@fastify/rate-limit` at the Redis store in `main.ts` — a one-option change.
4. Move `AuthService.pending` to Redis with a 10-minute TTL, replacing the
   in-memory `Map` and its `sweepPending` helper.
5. Optionally front `SessionService.resolve` with a short-TTL cache, remembering
   to invalidate on logout so revocation stays immediate.

Steps 3 and 4 are the ones that buy something. The rest is optimisation.
