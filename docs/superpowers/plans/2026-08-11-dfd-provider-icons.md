# DFD Provider Icons (AWS/Azure/GCP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let DFD infrastructure nodes (`process`, `service`, `data_store`, `queue`) optionally render with real AWS/Azure/GCP iconography — via draw.io's own built-in stencil libraries, not custom-authored shapes — instead of always using the 7 generic DFD shapes.

**Architecture:** A new optional `provider` field on `DfdNode` drives a coarse (provider × type, 12 entries, not per-exact-service) style lookup in the existing XML compiler/extractor. The AI generator learns to set it only when a learner explicitly names a vendor. Two curated labs get it retrofitted by hand. The editor's shape sidebar conditionally loads the matching built-in draw.io library (AWS4/Azure/GCP2) when editing a scenario that already uses one.

**Tech Stack:** TypeScript, Zod, the existing `shared/src/dfd-xml.ts` compile/extract layer, the existing self-hosted draw.io client's own bundled stencil libraries (no new dependencies, no new vendored assets).

## Global Constraints

- `provider` is scoped to exactly 4 node types: `process`, `service`, `data_store`, `queue`. `external_entity`, `third_party`, `trust_boundary` never get a provider style, regardless of what's set — a person or an outside company isn't "AWS-flavored."
- This is a coarse mapping — 12 total entries (3 providers × 4 types), not per-exact-service icons (S3 vs. RDS vs. DynamoDB all render identically as "AWS data store"). Do not expand scope to exact-service selection.
- The AI generator must set `provider` ONLY when the learner's intake explicitly names a cloud vendor — never inferred from generic cues like "the cloud" or "serverless."
- Exact draw.io style strings for AWS4/Azure/GCP2 icons MUST be verified live against the real vendored bundle (Task 2) before being written into the compiler (Task 3) — this codebase has twice found that guessed-from-memory draw.io flag/style behavior was wrong when checked against the actual vendored v31.1.8 build (`chrome=0` vs. the dead `chromeless=1`; `clibs=` needing an absolute origin). Do not skip Task 2 or hand-write style strings from general draw.io knowledge.
- No new npm dependencies, no new vendored assets — this feature only uses stencil libraries already present in `frontend/public/drawio/stencils/` (confirmed: `aws4.xml`, `azure.xml`, `gcp2.xml` all exist with real named shapes).

---

## File structure

**Modified:**
- `shared/src/schemas/dfd.ts` — `dfdNodeSchema` gains `provider`.
- `shared/src/dfd-xml.ts` — `PROVIDER_STYLE` map, compiler stamps `dfdProvider`, extractor reads it back.
- `shared/src/dfd-xml.test.ts` — round-trip tests for the new field.
- `frontend/features/dfd-editor/drawio-protocol.ts` — `embedUrl()` gains a `providers` param, builds `libs=`.
- `frontend/features/dfd-editor/drawio-protocol.test.ts` — tests for the new param.
- `frontend/features/dfd-editor/DfdEditorFrame.tsx` — derives the provider list from `graph` and passes it to `embedUrl()`.
- `backend/src/modules/ai/prompts.ts` — `AUTHOR_PROMPTS`'s JSON contract gains `provider`, plus guidance on when to set it.
- `backend/prisma/seed/labs/cloud-security-data-lake.json` — retrofit AWS.
- `backend/prisma/seed/labs/cloud-security-kubernetes.json` — retrofit GCP.

**No new files, no deletions.**

---

### Task 1: Add `provider` field to `dfdNodeSchema`

**Files:**
- Modify: `shared/src/schemas/dfd.ts`

**Interfaces:**
- Produces: `dfdNodeSchema` accepts an optional `provider: "aws" | "azure" | "gcp"` field; `DfdNode` (the inferred type) gains `provider?: "aws" | "azure" | "gcp"`.

- [ ] **Step 1: Add the field**

In `shared/src/schemas/dfd.ts`, add a new exported enum schema right after `dfdNodeTypeSchema`, and reference it from `dfdNodeSchema`:

```typescript
/** Coarse cloud-vendor styling hint for the 4 infrastructure node types
 *  (process/service/data_store/queue). Never set on external_entity,
 *  third_party, or trust_boundary — those aren't "vendor-flavored." */
export const dfdNodeProviderSchema = z.enum(["aws", "azure", "gcp"]);
export type DfdNodeProvider = z.infer<typeof dfdNodeProviderSchema>;
```

Then add one line to `dfdNodeSchema`:

```typescript
export const dfdNodeSchema = z.object({
  id: z.string().min(1),
  type: dfdNodeTypeSchema,
  label: z.string().min(1),
  description: z.string().default(""),
  trustBoundary: z.string().optional(),
  provider: dfdNodeProviderSchema.optional(),
  assets: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});
```

- [ ] **Step 2: Verify**

Run: `cd shared && pnpm build && pnpm typecheck && pnpm exec vitest run`
Expected: build succeeds, typecheck clean, all existing tests still pass (this is a purely additive optional field — nothing that parsed before should stop parsing).

- [ ] **Step 3: Commit**

```bash
git add shared/src/schemas/dfd.ts
git commit -m "Add optional provider field to DfdNode for cloud-vendor icon styling"
```

---

### Task 2: Live-verify real draw.io style strings for AWS4/Azure/GCP2 icons + the `libs=` value format

**Files:**
- Create: `docs/superpowers/plans/2026-08-11-dfd-provider-icons-findings.md` (a plain findings doc, not shipped code — this is the artifact Task 3 and Task 5 consume)

**Interfaces:**
- Produces: a findings doc containing 12 verified `style="..."` strings (one per provider × type combination) and the confirmed value format for the `libs=` URL parameter (single library key? semicolon-separated for multiple? does it need `decodeURIComponent`-safe encoding like `clibs=` does?).

This is a pure investigation task — no shipped code changes. It exists because this codebase has twice discovered that draw.io behavior guessed from general knowledge or public docs was wrong when checked against the actual vendored v31.1.8 bundle, and getting a style string wrong here doesn't error, it silently renders a blank shape.

**Candidate shape names already confirmed to exist in the vendored stencil files** (grepped during planning — real, valid, but their exact usable `style=` syntax in a real rendered diagram is NOT yet confirmed):
- AWS4 (`frontend/public/drawio/stencils/aws4.xml`): `lambda`, `rds`, `ec2`, `key management service`
- Azure (`frontend/public/drawio/stencils/azure.xml`): `Storage Blob`, `SQL Database`, `Virtual Machine`, `Queue Generic`
- GCP2 (`frontend/public/drawio/stencils/gcp2.xml`): `Cloud Storage`, `Cloud Functions`, `Cloud SQL`, `Compute Engine`

**Coarse type mapping to verify** (pick ONE representative shape per provider × type — these are suggestions based on the candidates above, adjust if a cleaner/more standard icon is found during verification):

| type | aws | azure | gcp |
|---|---|---|---|
| `process` | ec2 (or lambda) | Virtual Machine | Compute Engine |
| `service` | lambda | Virtual Machine or a Function-family shape if one exists | Cloud Functions |
| `data_store` | rds (or an S3-family shape if cleaner) | SQL Database or Storage Blob | Cloud SQL or Cloud Storage |
| `queue` | an SQS-family shape (search for "simple queue service" or "sqs") | Queue Generic | a Pub/Sub-family shape (search for "pub/sub" or "pubsub") |

- [ ] **Step 1: Stand up the real vendored editor standalone (not embedded)**

```bash
cd frontend/public/drawio
python3 -m http.server 8899
```

Open `http://localhost:8899/index.html` in a real browser (Playwright/chromium if available, or report back with instructions if this environment can't run a browser — see "When You're in Over Your Head" below). This is the FULL draw.io UI, not `embed=1` mode — so the shape search box, full sidebar, and right-click "Edit Style" menu are all available for direct investigation.

- [ ] **Step 2: For each of the 12 provider × type combinations, find and record the real style string**

For each row in the mapping table above:
1. Use the shape search box (usually labeled "Search shapes" at the top of the left sidebar) to search for the candidate shape name (e.g. "lambda").
2. Drag the matching result onto the canvas.
3. Right-click the placed shape → "Edit Style..." (or the keyboard shortcut `Ctrl+E`/`Cmd+E`).
4. Copy the exact `style="..."` value shown — this is what actually gets serialized into the diagram, which is what we need for `PROVIDER_STYLE` in `shared/src/dfd-xml.ts`.

If a specific candidate name from the table isn't a good visual match once you see it, search for a better alternative in the same provider's library and use that instead — the table's names are starting points, not requirements. Prefer simple, single-shape icons (not multi-part diagrams or grouped icons) since they need to render cleanly at our fixed node size (`NODE_W=168, NODE_H=88`, from `shared/src/dfd-layout.ts`).

- [ ] **Step 3: Determine the `libs=` value format**

Grep the vendored bundle directly (don't rely on general draw.io knowledge — this bundle's exact expectations have differed from public docs twice already in this codebase):

```bash
grep -oE ".{100}urlParams\.libs.{200}" frontend/public/drawio/js/app.min.js
```

Determine: what value does `urlParams.libs` need to be for the AWS4 library specifically (a short internal key — the file is named `aws4.xml` but the actual libs= key draw.io expects may differ, e.g. it could be `aws4` or something else — check `frontend/public/drawio/index.xml` or search the bundle for where library keys are registered/mapped to `.xml` filenames), and — critically — **what happens if you set `libs=` to load a specific library while `clibs=` (our custom DFD shapes) is ALSO set?** Confirm both can coexist on the same URL (semicolon-separated within one param, or as two separate params) by testing it live: load the standalone editor with both a `libs=` value and a `clibs=` value in the URL simultaneously and confirm both libraries actually appear in the sidebar.

- [ ] **Step 4: Write the findings doc**

```markdown
# DFD provider icons — verified style strings and libs= format

Verified against the vendored jgraph/drawio v31.1.8 build
(frontend/public/drawio/), live in a real browser, per Task 2 of
docs/superpowers/plans/2026-08-11-dfd-provider-icons.md.

## Style strings

| provider | type | style |
|---|---|---|
| aws | process | `<exact verified style="..." value>` |
| aws | service | `...` |
| aws | data_store | `...` |
| aws | queue | `...` |
| azure | process | `...` |
| azure | service | `...` |
| azure | data_store | `...` |
| azure | queue | `...` |
| gcp | process | `...` |
| gcp | service | `...` |
| gcp | data_store | `...` |
| gcp | queue | `...` |

## libs= format

<exact confirmed value format, e.g. "libs=aws4" for a single library, and
how multiple would be expressed if ever needed — confirm from the grep in
Step 3, not from memory>

## Confirmed: libs= and clibs= coexist

<yes/no, with the exact combined query string you tested>
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-11-dfd-provider-icons-findings.md
git commit -m "Verify draw.io provider icon style strings and libs= format against the live vendored bundle"
```

**When You're in Over Your Head:** if this environment cannot run a browser (no Playwright/display available), report BLOCKED with exactly what you tried — do not fabricate style strings from general draw.io knowledge or public documentation. The whole point of this task is that guessed values silently render wrong instead of erroring, and this codebase has been burned by that twice already.

---

### Task 3: `PROVIDER_STYLE` map + compiler wiring

**Files:**
- Modify: `shared/src/dfd-xml.ts`
- Modify: `shared/src/dfd-xml.test.ts`
- Read: `docs/superpowers/plans/2026-08-11-dfd-provider-icons-findings.md` (Task 2's output — this task's exact style-string values come from there)

**Interfaces:**
- Consumes: `DfdNodeProvider` from `./schemas/dfd` (Task 1); the 12 verified style strings from Task 2's findings doc.
- Produces: `compileToDrawioXml` stamps a `dfdProvider="<provider>"` attribute on provider-styled nodes and uses the provider-specific style instead of the generic `SHAPE_STYLE[node.type]` when applicable.

- [ ] **Step 1: Write the failing test**

```typescript
// shared/src/dfd-xml.test.ts — add to the existing compileToDrawioXml describe block
it("uses a provider-specific style and stamps dfdProvider when a node has a provider", () => {
  const graph = dfdGraphSchema.parse({
    version: "1.0",
    nodes: [
      { id: "a", type: "data_store", label: "A", provider: "aws" },
      { id: "b", type: "external_entity", label: "B" }, // no provider set, and wrong type for one anyway
    ],
    edges: [],
    trustBoundaries: [],
  });
  const xml = compileToDrawioXml(graph);
  expect(xml).toContain('dfdProvider="aws"');
  // The generic external_entity style must still be used for the node with no provider.
  expect(xml).toMatch(/id="b"[^>]*dfdKind="node"[\s\S]{0,50}rounded=0;whiteSpace=wrap;html=1;/);
});

it("ignores provider on non-infrastructure types even if somehow set", () => {
  // dfdNodeSchema doesn't forbid provider on e.g. external_entity at the type level
  // (it's a per-field optional, not cross-field validated) — the COMPILER is what
  // enforces the 4-type scoping, so this proves that enforcement directly.
  const graph = dfdGraphSchema.parse({
    version: "1.0",
    nodes: [{ id: "a", type: "external_entity", label: "A", provider: "aws" }],
    edges: [],
    trustBoundaries: [],
  });
  const xml = compileToDrawioXml(graph);
  expect(xml).not.toContain('dfdProvider="aws"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && pnpm exec vitest run dfd-xml.test.ts`
Expected: FAIL — `dfdProvider` never appears in output yet.

- [ ] **Step 3: Write the implementation**

In `shared/src/dfd-xml.ts`, add near `SHAPE_STYLE` (after its closing brace, before `BOUNDARY_STYLE`):

```typescript
/**
 * Coarse cloud-provider icon styling, scoped to the 4 infrastructure node
 * types (process/service/data_store/queue) — external_entity, third_party,
 * and trust_boundary never get a provider style. One representative style
 * per provider×type combination (12 total), not per-exact-service icons —
 * S3 vs. RDS vs. DynamoDB all render identically as "AWS data store". Every
 * style string below was verified live against the real vendored v31.1.8
 * build (docs/superpowers/plans/2026-08-11-dfd-provider-icons-findings.md),
 * not guessed from general draw.io knowledge — a wrong style string doesn't
 * error, it silently renders a blank shape.
 */
const PROVIDER_STYLE: Partial<Record<DfdNodeProvider, Partial<Record<DfdNodeType, string>>>> = {
  aws: {
    process: "<PASTE Task 2's verified aws/process style here>",
    service: "<PASTE Task 2's verified aws/service style here>",
    data_store: "<PASTE Task 2's verified aws/data_store style here>",
    queue: "<PASTE Task 2's verified aws/queue style here>",
  },
  azure: {
    process: "<PASTE Task 2's verified azure/process style here>",
    service: "<PASTE Task 2's verified azure/service style here>",
    data_store: "<PASTE Task 2's verified azure/data_store style here>",
    queue: "<PASTE Task 2's verified azure/queue style here>",
  },
  gcp: {
    process: "<PASTE Task 2's verified gcp/process style here>",
    service: "<PASTE Task 2's verified gcp/service style here>",
    data_store: "<PASTE Task 2's verified gcp/data_store style here>",
    queue: "<PASTE Task 2's verified gcp/queue style here>",
  },
};

/** Only these 4 types are ever provider-styled. */
const PROVIDER_ELIGIBLE_TYPES = new Set<DfdNodeType>(["process", "service", "data_store", "queue"]);

function styleFor(node: DfdNode): string {
  if (node.provider && PROVIDER_ELIGIBLE_TYPES.has(node.type)) {
    const override = PROVIDER_STYLE[node.provider]?.[node.type];
    if (override) return override;
  }
  return SHAPE_STYLE[node.type];
}
```

Update the `import type` line at the top of the file to include `DfdNodeProvider`:

```typescript
import type { DfdGraph, DfdNode, DfdNodeProvider, DfdNodeType } from "./schemas/dfd";
```

Then update the node-emission loop (the existing `for (const node of graph.nodes)` block) to use `styleFor(node)` instead of `SHAPE_STYLE[node.type]`, and to stamp `dfdProvider` only when it was actually applied:

```typescript
for (const node of graph.nodes) {
  const pos = layout.nodes.get(node.id)!;
  const providerApplied = node.provider && PROVIDER_ELIGIBLE_TYPES.has(node.type) && PROVIDER_STYLE[node.provider]?.[node.type];
  cells.push(
    `<object id="${escapeXml(node.id)}" label="${escapeXml(node.label)}" dfdKind="node" dfdType="${node.type}" ` +
      (providerApplied ? `dfdProvider="${node.provider}" ` : "") +
      `dfdDescription="${escapeXml(node.description)}" dfdAssets="${escapeXml(node.assets.map(encodeURIComponent).join(","))}"` +
      (node.trustBoundary ? ` dfdTrustBoundary="${escapeXml(node.trustBoundary)}"` : "") +
      `><mxCell style="${styleFor(node)}" vertex="1" parent="1">` +
      `<mxGeometry x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" as="geometry"/>` +
      `</mxCell></object>`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shared && pnpm exec vitest run dfd-xml.test.ts`
Expected: PASS. Also run the full shared suite (`pnpm exec vitest run`) to confirm the existing curated-seed round-trip tests still pass unmodified (they should — none of the 9 existing seeds have `provider` set yet, so `styleFor` falls through to the exact same `SHAPE_STYLE[node.type]` path as before).

- [ ] **Step 5: Commit**

```bash
git add shared/src/dfd-xml.ts shared/src/dfd-xml.test.ts
git commit -m "Add provider-specific icon styling to compileToDrawioXml"
```

---

### Task 4: Extractor reads `dfdProvider` back

**Files:**
- Modify: `shared/src/dfd-xml.ts`
- Modify: `shared/src/dfd-xml.test.ts`

**Interfaces:**
- Produces: `extractFromDrawioXml` includes `provider` on any node whose `<object>` carries a `dfdProvider` attribute.

- [ ] **Step 1: Write the failing test**

```typescript
// shared/src/dfd-xml.test.ts — add to the extractFromDrawioXml describe block
it("round-trips a node's provider field", () => {
  const graph = dfdGraphSchema.parse({
    version: "1.0",
    nodes: [{ id: "a", type: "data_store", label: "A", provider: "aws" }],
    edges: [],
    trustBoundaries: [],
  });
  const extracted = extractFromDrawioXml(compileToDrawioXml(graph));
  expect(extracted).toEqual(graph);
});

it("extracts no provider for a node that never had one", () => {
  const graph = dfdGraphSchema.parse({
    version: "1.0",
    nodes: [{ id: "a", type: "process", label: "A" }],
    edges: [],
    trustBoundaries: [],
  });
  const extracted = extractFromDrawioXml(compileToDrawioXml(graph));
  expect(extracted.nodes[0].provider).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && pnpm exec vitest run dfd-xml.test.ts`
Expected: FAIL — the first test fails because `extracted` has no `provider` field at all yet.

- [ ] **Step 3: Write the implementation**

In `extractFromDrawioXml`'s `handle()` function, in the node-push branch (the final `nodes.push({...})` call), add one line:

```typescript
nodes.push({
  id,
  type: (attrs["@_dfdType"] as string | undefined) ?? inferType(style),
  label,
  description: String(attrs["@_dfdDescription"] ?? ""),
  ...(attrs["@_dfdTrustBoundary"] ? { trustBoundary: String(attrs["@_dfdTrustBoundary"]) } : {}),
  ...(attrs["@_dfdProvider"] ? { provider: String(attrs["@_dfdProvider"]) } : {}),
  assets: splitList(attrs["@_dfdAssets"]),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shared && pnpm exec vitest run dfd-xml.test.ts`
Expected: PASS. Run the full shared suite once more (`pnpm exec vitest run`) — should now include all curated-seed round-trips plus the new provider tests, all green.

- [ ] **Step 5: Commit**

```bash
git add shared/src/dfd-xml.ts shared/src/dfd-xml.test.ts
git commit -m "Extract a node's provider field back from draw.io XML"
```

---

### Task 5: Editor loads the matching built-in library based on graph content

**Files:**
- Modify: `frontend/features/dfd-editor/drawio-protocol.ts`
- Modify: `frontend/features/dfd-editor/drawio-protocol.test.ts`
- Modify: `frontend/features/dfd-editor/DfdEditorFrame.tsx`
- Read: `docs/superpowers/plans/2026-08-11-dfd-provider-icons-findings.md` (Task 2's `libs=` format finding)

**Interfaces:**
- Consumes: the confirmed `libs=` value format from Task 2's findings doc. `DfdEditorFrame.tsx` already imports `DfdGraph` from `@curated-labs/shared` (unchanged); the provider values themselves are typed as an inline `"aws" | "azure" | "gcp"` literal union in both files rather than importing `DfdNodeProvider` — structurally identical to it, and keeps `drawio-protocol.ts` free of a `@curated-labs/shared` dependency it doesn't otherwise need.
- Produces: `embedUrl(mode: "view" | "edit", origin?: string, providers?: DfdNodeProvider[]): string` (new optional third param — existing 2-arg call sites keep working unchanged).

The exact implementation of Step 3 below depends on what Task 2 found about the `libs=` value format — the code shown is a reasonable default (assuming a single semicolon-joined `libs=` value works, matching how `clibs=` already handles multiple entries) but MUST be adjusted to match whatever Task 2's findings doc actually confirmed, including if it turns out `libs=` and `clibs=` can't simply coexist as written (in which case, read Task 2's findings for the actual confirmed combined-URL shape and use that instead).

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/features/dfd-editor/drawio-protocol.test.ts — add to the embedUrl describe block
it("adds libs= for a single provider present in the graph", () => {
  const url = embedUrl("edit", "http://localhost:3000", ["aws"]);
  expect(url).toContain("libs=aws4"); // adjust the library key if Task 2 found a different one
});

it("omits libs= when no provider is present", () => {
  const url = embedUrl("edit", "http://localhost:3000", []);
  expect(url).not.toContain("libs=");
});

it("still loads clibs= (our custom DFD shapes) alongside libs=", () => {
  const url = embedUrl("edit", "http://localhost:3000", ["aws"]);
  expect(url).toContain("clibs=");
  expect(url).toContain("libs=");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm exec vitest run drawio-protocol.test.ts`
Expected: FAIL — `embedUrl` doesn't accept a third argument yet.

- [ ] **Step 3: Write the implementation**

In `frontend/features/dfd-editor/drawio-protocol.ts`, add a mapping from our `provider` values to draw.io's internal library keys (fill in the exact key from Task 2's findings — `aws4` below is this plan's best guess, confirm/correct against the findings doc):

```typescript
const PROVIDER_LIBRARY_KEY: Record<"aws" | "azure" | "gcp", string> = {
  aws: "aws4",
  azure: "azure",
  gcp: "gcp2",
};

export function embedUrl(mode: "view" | "edit", origin = "", providers: ("aws" | "azure" | "gcp")[] = []): string {
  const params = new URLSearchParams({
    embed: "1",
    proto: "json",
    spin: "1",
    libraries: "1",
    ...(mode === "view" ? { chrome: "0" } : { clibs: `U${origin}${DFD_SHAPE_LIBRARY_URL}` }),
  });
  if (mode === "edit" && providers.length > 0) {
    const keys = [...new Set(providers.map((p) => PROVIDER_LIBRARY_KEY[p]))];
    params.set("libs", keys.join(";"));
  }
  return `/drawio/index.html?${params.toString()}`;
}
```

In `frontend/features/dfd-editor/DfdEditorFrame.tsx`, derive the provider list from `graph` and pass it through. Find the existing `embedUrl(mode)` call (inside the `useEffect`/`useState` pair that computes `src` post-mount) and change it to:

```typescript
const providers = [...new Set(graph.nodes.map((n) => n.provider).filter((p): p is "aws" | "azure" | "gcp" => Boolean(p)))];
setSrc(embedUrl(mode, window.location.origin, providers));
```

Add `providers` to that effect's dependency array alongside the existing `mode`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm exec vitest run drawio-protocol.test.ts && pnpm exec tsc --noEmit -p . && pnpm exec vitest run`
Expected: PASS, clean typecheck, no regressions in the full frontend suite.

- [ ] **Step 5: Commit**

```bash
git add frontend/features/dfd-editor
git commit -m "Load the matching draw.io built-in library when a scenario uses a cloud provider"
```

---

### Task 6: AI generator learns to set `provider`

**Files:**
- Modify: `backend/src/modules/ai/prompts.ts`

**Interfaces:** none new — this only changes prompt text, not code structure.

- [ ] **Step 1: Update the JSON contract**

In `AUTHOR_PROMPTS.playground_scenario.system` (the generator's JSON contract string), change the `nodes` line:

```typescript
    "nodes": [{ "id": string, "type": "external_entity" | "process" | "data_store" | "service" | "queue" | "third_party" | "trust_boundary",
                "label": string, "description": string, "trustBoundary"?: string,
                "provider"?: "aws" | "azure" | "gcp", "assets": string[] }],
```

- [ ] **Step 2: Add guidance on when to set it**

Immediately after the existing "Size requirements" section in the same prompt string (or in the AUTHOR_GUARDRAILS section, wherever similar per-field authoring rules already live in this file — check the existing style first), add:

```
- "provider" on a node is OPTIONAL and applies only to process/service/data_store/queue
  nodes. Set it ONLY when the learner's own description explicitly names a specific cloud
  vendor (e.g. they wrote "AWS", "Azure", "GCP", "Google Cloud", or a named vendor service
  like "S3" or "Lambda"). Never set it from generic cues like "the cloud" or "serverless" —
  those describe a pattern, not a vendor, and get no provider. When in doubt, leave it unset.
```

- [ ] **Step 3: Verify**

Run: `cd backend && pnpm exec tsc --noEmit -p . && pnpm exec vitest run playground-prompts.test.ts`
Expected: clean typecheck; the existing `playground-prompts.test.ts` regression guard (which asserts `Object.keys(PROMPTS)` stays exactly the 5 curated keys and doesn't touch `AUTHOR_PROMPTS`) still passes unchanged, since this task only edits prompt text inside `AUTHOR_PROMPTS`, not `PROMPTS`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/ai/prompts.ts
git commit -m "Teach the scenario generator to set provider only when a vendor is explicitly named"
```

---

### Task 7: Curated lab retrofit

**Files:**
- Modify: `backend/prisma/seed/labs/cloud-security-data-lake.json`
- Modify: `backend/prisma/seed/labs/cloud-security-kubernetes.json`

**Interfaces:** none — this is data-only, no code changes.

- [ ] **Step 1: Retrofit `cloud-security-data-lake.json` with AWS**

Add `"provider": "aws"` to exactly these 4 nodes in the `dfd.nodes` array (confirmed node ids during planning): `ingest` (data_store), `curated` (data_store), `transform` (process), `query` (service). Do NOT add it to `app`, `analyst` (both `external_entity`), or `partner` (`third_party`) — those types never get a provider.

Example for one node (apply the same `"provider": "aws"` addition to the other 3):

```json
{
  "id": "ingest",
  "type": "data_store",
  "label": "Ingest Bucket",
  "description": "Raw event landing zone",
  "provider": "aws",
  ...
}
```

- [ ] **Step 2: Retrofit `cloud-security-kubernetes.json` with GCP**

Add `"provider": "gcp"` to exactly these 4 nodes (confirmed node ids during planning): `pods` (service), `secrets` (data_store), `db` (data_store), `ci` (process). Do NOT add it to `client` (`external_entity`), `ingress` (`process` — deliberately excluded: an ingress controller is Kubernetes-native and identical on every cloud, not GCP-specific), or `registry` (`third_party`).

- [ ] **Step 3: Verify the seed files still parse and re-seed**

Run: `cd shared && pnpm exec vitest run dfd.test.ts 2>/dev/null; pnpm exec vitest run` (confirms `labSeedSchema.parse()` on the real seed files still succeeds — this file may not exist under that exact name post-migration, so also just run the full shared suite to be sure nothing chokes on the two edited JSON files).

Then re-seed the dev database so the retrofit actually reaches the DB (curated lab DFDs are compiled to XML at seed time, per the existing `seed.ts` pipeline):

```bash
cd backend && pnpm db:seed
```

Expected: completes without error for all 9 labs.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed/labs/cloud-security-data-lake.json backend/prisma/seed/labs/cloud-security-kubernetes.json
git commit -m "Retrofit AWS/GCP provider icons onto the two cloud-flavored curated labs"
```

---

### Task 8: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full automated suite**

```bash
pnpm -r typecheck
pnpm -r test
```

Expected: everything green — shared (existing + new provider round-trip tests), backend (existing, unaffected — this feature touches no backend logic beyond prompt text), frontend (existing + new `libs=`/provider tests).

- [ ] **Step 2: Manual/screenshot verification**

Start both dev servers, then:
1. Load the "Serverless Data Lake" curated lab detail page — confirm `ingest`/`curated`/`transform`/`query` render with AWS-styled icons (not the generic shapes), and `app`/`analyst`/`partner` still render generically. No console errors.
2. Load the "Multi-Tenant SaaS on Kubernetes" curated lab — confirm `pods`/`secrets`/`db`/`ci` render GCP-styled, `client`/`ingress`/`registry` stay generic.
3. Load any OTHER curated lab (one with no provider retrofit) — confirm it renders exactly as before, no regression.
4. Generate a Custom Playground scenario with a prompt that explicitly names "AWS" (e.g. "a system using AWS Lambda and S3 for image processing") — open its review page in edit mode, confirm the AWS4 library appears in the shape sidebar alongside our "DFD Shapes" library (both, not just one).
5. Generate a second scenario with a vendor-neutral prompt (no cloud vendor named) — confirm NO provider library loads, only "DFD Shapes" appears, matching current behavior.

- [ ] **Step 3: Report results, no commit needed for this task**
