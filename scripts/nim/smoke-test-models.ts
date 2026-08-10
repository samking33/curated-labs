/**
 * Smoke-tests candidate NIM models so model selection is measured, not guessed.
 * Spec §14: reject anything that cannot reliably return parseable JSON.
 *
 *   node --env-file=.env --experimental-strip-types scripts/nim/smoke-test-models.ts
 *
 * ponytail: chat + strict-JSON + latency only. Prompt-injection and timeout
 * fixtures belong with the AI gateway in Milestone 7, where there is a prompt
 * registry to run them against.
 */

const baseUrl = process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const apiKey = process.env.NVIDIA_NIM_API_KEY;
if (!apiKey) throw new Error("NVIDIA_NIM_API_KEY is required");

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 30000);

const CHAT_CANDIDATES = [
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "meta/llama-3.3-70b-instruct",
  "mistralai/mistral-large-2-instruct",
  "nvidia/nvidia-nemotron-nano-9b-v2",
  "meta/llama-3.1-8b-instruct",
];

const EMBED_CANDIDATES = [
  "nvidia/llama-3.2-nv-embedqa-1b-v1",
  "nvidia/nv-embedqa-e5-v5",
  "nvidia/nemotron-3-embed-1b",
  "baai/bge-m3",
];

/*
 * Realistic prompt size on purpose.
 *
 * The first version of this script asked models to "Say ok" and ranked them by
 * the result. That flattered the large models and produced a ranking that
 * inverted completely under real load — a model that answered a one-liner in
 * 2.7 s took 21 s (or timed out) on an actual lab prompt. A smoke test has to
 * approximate the real payload or it measures nothing useful.
 */
const RUBRIC = Array.from(
  { length: 5 },
  (_, i) =>
    `- id=A${i + 1} | Issue ${i + 1}: a trust boundary is crossed without transport protection, ` +
    `credentials are shared more widely than needed, and sensitive data is retained with no stated limit.`,
).join("\n");

const JSON_PROMPT = `LAB DATA — architecture issue rubric (trusted):
${RUBRIC}

<<<BEGIN LEARNER ANSWER (UNTRUSTED)>>>
The session cache is written over a plaintext protocol so anyone able to read it can steal a live session.
The storefront also talks to the orders API over plain HTTP even though that crosses a trust boundary, and
I see no signature verification on the inbound payment webhook.
<<<END LEARNER ANSWER>>>

Return only valid JSON matching this schema:
{"ok": boolean, "reason": string, "coveredIssueIds": string[]}`;

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

/** Models often wrap JSON in prose or a ```json fence. One repair attempt, per spec. */
function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.replace(/```(?:json)?/g, "").match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON found");
    return JSON.parse(match[0]);
  }
}

type ChatResult = { model: string; ok: boolean; json: boolean; repaired: boolean; ms: number; note: string };

async function testChat(model: string): Promise<ChatResult> {
  const started = performance.now();
  try {
    const body = (await post("/chat/completions", {
      model,
      temperature: 0.1,
      max_tokens: 600,
      messages: [
        { role: "system", content: "You output only JSON. No prose, no code fences." },
        { role: "user", content: JSON_PROMPT },
      ],
    })) as { choices?: { message?: { content?: string } }[] };

    const ms = Math.round(performance.now() - started);
    const text = (body.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return { model, ok: false, json: false, repaired: false, ms, note: "empty response" };

    let repaired = false;
    try {
      JSON.parse(text);
    } catch {
      repaired = true;
    }
    const parsed = extractJson(text) as { ok?: unknown };
    const shapeOk = typeof parsed.ok === "boolean";
    return { model, ok: true, json: shapeOk, repaired, ms, note: shapeOk ? "" : "wrong shape" };
  } catch (err) {
    return {
      model,
      ok: false,
      json: false,
      repaired: false,
      ms: Math.round(performance.now() - started),
      note: String(err instanceof Error ? err.message : err).slice(0, 70),
    };
  }
}

async function testEmbed(model: string) {
  const started = performance.now();
  try {
    const body = (await post("/embeddings", {
      model,
      input: ["session token stolen from an unencrypted cache"],
      input_type: "query",
      encoding_format: "float",
    })) as { data?: { embedding?: number[] }[] };
    const dims = body.data?.[0]?.embedding?.length ?? 0;
    return { model, ok: dims > 0, dims, ms: Math.round(performance.now() - started), note: "" };
  } catch (err) {
    return {
      model,
      ok: false,
      dims: 0,
      ms: Math.round(performance.now() - started),
      note: String(err instanceof Error ? err.message : err).slice(0, 70),
    };
  }
}

const chat = await Promise.all(CHAT_CANDIDATES.map(testChat));
console.log("\nCHAT / JSON\n");
console.table(
  chat.map((r) => ({
    model: r.model,
    reachable: r.ok ? "yes" : "NO",
    json: r.json ? (r.repaired ? "after repair" : "clean") : "FAIL",
    ms: r.ms,
    note: r.note,
  })),
);

const embed = await Promise.all(EMBED_CANDIDATES.map(testEmbed));
console.log("\nEMBEDDINGS\n");
console.table(
  embed.map((r) => ({ model: r.model, reachable: r.ok ? "yes" : "NO", dims: r.dims, ms: r.ms, note: r.note })),
);

const usable = chat.filter((r) => r.json).sort((a, b) => a.ms - b.ms);
console.log(`\n${usable.length}/${chat.length} chat models return usable JSON.`);
