# AI Rules

## Selected models

Measured against the project key with `pnpm nim:smoke`, and cross-checked against
production latency in the `ai_calls` table.

| Task | Order tried | Why |
|---|---|---|
| All coaching tasks | `meta/llama-3.1-8b-instruct` → `nvidia/nemotron-3-super-120b-a12b` → `openai/gpt-oss-20b` | Fast model first: identical classification accuracy, 5× lower latency |
| Threat semantic matching | `nvidia/nv-embedqa-e5-v5` | 1024-dim, ~570 ms, retrieval-tuned |

Overrides live in `.env` (`NVIDIA_NIM_MODEL_*`). The *order* is in
`AiService.modelsFor()` — one line if you want to trade latency for prose.

## How the order was chosen, and how it was wrong the first time

The original ranking came from a smoke test whose entire prompt was
`"Say ok."`. On that, `gpt-oss-20b` answered in 2.7 s and looked like the best
JSON model, so it led the chain.

Under real prompts — a full DFD, a five-issue rubric and a learner answer — the
ranking **inverted completely**:

| Model | Toy prompt | Real prompt | Outcome |
|---|---|---|---|
| `meta/llama-3.1-8b-instruct` | 1.4 s | **~3–4 s** | Reliable |
| `nvidia/nemotron-3-super-120b-a12b` | 9.8 s | ~8 s | Often narrates around the JSON → unparseable |
| `openai/gpt-oss-20b` | 2.7 s | **~21 s, or exceeds the 25 s timeout** | Frequently unusable |

A head-to-head on an identical on-topic answer settled it — **all three returned
the same result** (`coveredIssueIds: [A1, A2, A3]`, same two missed, comparable
coaching tips). The only difference was how richly the summary was written. The
fast model is therefore not a quality compromise on anything that affects the
learner's progress; it is 5× faster for slightly plainer prose.

`scripts/nim/smoke-test-models.ts` now sends a realistically sized prompt, and
its ranking matches production.

## Latency budget

Three settings bound how long a learner waits:

| Setting | Default | Bounds |
|---|---|---|
| `AI_TIMEOUT_MS` | 25 000 | One HTTP request |
| `AI_RETRY_COUNT` | 1 | Retries of a *transient* failure |
| `AI_TASK_BUDGET_MS` | 45 000 | The entire task, across every retry and fallback model |

**A timeout is never retried.** The prompt was too slow to process; sending it
again produces the same timeout. Retrying turned one 25 s timeout into 90 s, and
because the chain then fell through to the next model, a single step submission
could exceed four minutes. `TERMINAL_CODES` in `nim-client.ts` marks TIMEOUT,
EMPTY_RESPONSE and NOT_CONFIGURED as move-on-immediately.

Measured effect on a step submission: **41.7 s → 4.2 s.**

## Rejected candidates

Listed by `/v1/models` but not usable on this key:

| Model | Failure |
|---|---|
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | 404 — not deployed |
| `mistralai/mistral-large-2-instruct` | 404 — not deployed |
| `nvidia/llama-3.2-nv-embedqa-1b-v1` | 404 — not deployed |
| `meta/llama-3.3-70b-instruct` | Timeout |
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | Empty response |
| `nvidia/nvidia-nemotron-nano-9b-v2` | Empty response |
| `baai/bge-m3` | 500 |

## Constraints on every AI call

- The browser never calls NIM. The API key stays server-side, in `NimClient`.
- Learner answers are untrusted input. DFDs, canonical threats and mitigations
  are trusted only when read from the database.
- AI may classify, match, explain, summarize and coach. It may **not** create
  canonical threats, mitigations or answer keys.
- Threat matching selects only from canonical IDs supplied in the prompt;
  unknown IDs are dropped by `restrictIds` and the drop rate is logged.
- Reveal timing is the platform's decision — `shouldRevealAnswers` from the
  model is always forced to `false`.
- Mitigation correctness is computed from the database **before** the AI call;
  the model's `isCorrect` is overwritten with the platform's verdict.
- Every response is parsed with one repair attempt (`extractJson` strips
  `<think>` blocks and code fences, then takes the outermost object) and
  validated against its Zod schema.
- `temperature: 0.1` for evaluation-like tasks.
- Never log prompts in production, and never log the key.

## Re-running

```bash
pnpm nim:inspect   # what the key can see
pnpm nim:smoke     # what works under a realistic prompt, with latencies
```

Production truth lives in `ai_calls`:

```sql
SELECT task_type, model_id, status, error_code, count(*), round(avg(latency_ms))
FROM ai_calls GROUP BY 1,2,3,4 ORDER BY 5 DESC;
```
