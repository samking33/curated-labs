/**
 * Lists the models the configured NVIDIA NIM key can reach.
 * Spec §28 requires running this before any AI code is written.
 *
 *   node --env-file=.env --experimental-strip-types scripts/nim/inspect-models.ts
 *
 * ponytail: /v1/models is a bearer-token GET. Node's fetch covers it — the
 * OpenAI SDK arrives with the AI gateway in Milestone 7, not before.
 */

const baseUrl = process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const apiKey = process.env.NVIDIA_NIM_API_KEY;

if (!apiKey) throw new Error("NVIDIA_NIM_API_KEY is required");

type Model = { id: string; object?: string; owned_by?: string };

const res = await fetch(`${baseUrl}/models`, {
  headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
});

if (!res.ok) {
  // Never echo the key or the raw Authorization header.
  throw new Error(`GET ${baseUrl}/models failed: ${res.status} ${res.statusText}`);
}

const body = (await res.json()) as { data?: Model[] };
const ids = (body.data ?? []).map((m) => m.id).sort();

console.log(JSON.stringify(ids, null, 2));
console.error(`\n${ids.length} models reachable at ${baseUrl}`);
