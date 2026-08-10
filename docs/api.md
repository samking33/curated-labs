# API

All routes are under `/api/v1`. JSON only. Every response carries
`x-request-id`, and every error uses one envelope:

```json
{ "error": { "code": "FORBIDDEN", "message": "…", "requestId": "req_…" } }
```

Codes: `BAD_REQUEST` `UNAUTHORIZED` `FORBIDDEN` `NOT_FOUND` `CONFLICT`
`RATE_LIMITED` `AI_UNAVAILABLE` `INTERNAL`.

Auth is a `httpOnly` session cookie. Mutations additionally require the
`x-csrf-token` header echoing the readable `cl_csrf` cookie.

Step submissions accept `Idempotency-Key`; replaying a key returns the original
result without re-running the AI call.

## Routes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/auth/google` | public | Starts OIDC |
| GET | `/auth/google/callback` | public | Creates session, redirects to the web app |
| POST | `/auth/dev-login` | public | 404 unless `ALLOW_DEV_LOGIN` |
| POST | `/auth/logout` | session | Revokes the session |
| GET | `/auth/me` | session | User, platform roles, organizations, account kind |
| POST | `/onboarding/individual` | session | |
| POST | `/onboarding/organizations` | session | Creator becomes `org_owner` |
| POST | `/invitations/accept` | session | Email must match the invitation |
| GET | `/lab-categories` | public | |
| GET | `/labs` | public | `?category=slug`; includes attempt state when signed in |
| GET | `/labs/:labId` | public | Slug or UUID. **No answer keys** |
| GET | `/labs/:labId/dfd` | public | |
| POST | `/labs/:labId/attempts` | session | Resumes an in-progress attempt |
| GET | `/attempts/:id` | owner or org staff | |
| GET | `/attempts/:id/progress` | owner or org staff | |
| POST | `/attempts/:id/steps/architecture-issues` | owner | |
| POST | `/attempts/:id/steps/threats` | owner | Reveals the set after the retry limit |
| POST | `/attempts/:id/steps/prioritization` | owner | |
| POST | `/attempts/:id/steps/mitigations` | owner | Deterministic correctness |
| POST | `/attempts/:id/steps/release-decision` | owner | Completes the attempt |
| GET | `/me/progress` | session | |
| GET | `/organizations` | session | |
| GET/PATCH | `/organizations/:id` | `progress:view_org` / `org:manage` | |
| GET | `/organizations/:id/members` | `progress:view_org` | |
| PATCH/DELETE | `/organizations/:id/members/:userId` | `org:manage` | Cannot self-modify or orphan the last owner |
| GET/POST | `/organizations/:id/departments` | `progress:view_org` / `department:manage` | |
| PATCH/DELETE | `/organizations/:id/departments/:deptId` | `department:manage` (scoped) | |
| POST/DELETE | `/organizations/:id/departments/:deptId/members[/:userId]` | `department:assign_users` (scoped) | |
| GET/POST | `/organizations/:id/invitations` | `invitation:write` | Token returned once |
| POST | `/organizations/:id/invitations/:invId/revoke` | `invitation:write` | |
| GET | `/organizations/:id/progress` | `progress:view_org` | Department managers see only their departments |
| GET | `/organizations/:id/departments/:deptId/progress` | `progress:view_org` (scoped) | |
| GET | `/health/live` `/health/ready` `/health/dependencies` | public | NIM down ≠ not ready |

## Step response envelope

Every step returns the same shape so the UI has one rendering path:

```json
{
  "submissionId": "uuid",
  "attemptNumber": 1,
  "currentStep": "prioritization",
  "aiFeedback": { },
  "aiStatus": "ok | unavailable | invalid",
  "deterministicResult": { },
  "revealedThreats": null
}
```

`aiStatus: "unavailable"` means NIM failed — **the answer is still saved.**
`revealedThreats` is non-null only once the reveal rules allow it.
