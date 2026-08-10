# draw.io DFD Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom React DFD renderer with a self-hosted draw.io editor, storing draw.io XML as the sole persisted form of every DFD while keeping AI generation and grading running on the same structured `DfdGraph` JSON they use today (derived from the XML on every read).

**Architecture:** A deterministic, isomorphic compile/extract layer in `shared/` converts between our `DfdGraph` JSON and draw.io's mxGraph XML. AI generation and curated seed authoring keep producing JSON exactly as today; that JSON is compiled to XML once and persisted. A new `DfdEditorFrame` component embeds a self-hosted draw.io build via `postMessage` for both view-only display and (Custom Playground's pre-attempt review step only) interactive editing, with server-side re-extraction and referential-integrity validation gating every save.

**Tech Stack:** TypeScript, Zod, `fast-xml-parser` (XML → JSON only; JSON → XML is hand-templated), self-hosted `jgraph/drawio` static web client (vendored, not built from source), NestJS, Prisma, Next.js.

## Global Constraints

- Every DFD is persisted exactly once, as draw.io XML. `DfdGraph` JSON is never stored — always derived from XML at read time via `extractFromDrawioXml()`.
- AI generation (`AUTHOR_PROMPTS`, `generateScenario`), `validateSeedReferences`, `validateGeneratedScenario`, and all grading/coaching logic in `attempts.service.ts` / `playground-attempts.service.ts` / `common/workflow.ts` are untouched — they keep consuming `DfdGraph` JSON exactly as today.
- Node `type` is a rendering concern only (confirmed via grep: never read by AI prompts or grading) — no downstream logic needs to change to accommodate the new storage model.
- **Scope note, agreed during planning:** there is no admin/curator authoring UI anywhere in this codebase today (curated labs are only ever created via `backend/prisma/seed/labs/*.json` + `seed.ts`). Building a curator-facing draw.io authoring surface would mean inventing an entire admin CMS (auth-gated CRUD routes, forms, a publish workflow) that doesn't exist and was not part of what was scoped. This plan does NOT build that. Curated lab DFDs continue to be authored as `DfdGraph` JSON in seed files, compiled to XML at seed time (Task 6). draw.io is used for curated labs on the **viewing** side only (replacing the custom renderer in `LabShell.tsx`, view-only mode) and for the **Custom Playground review/edit step**, which already has a real UI and endpoints to hang editing off of.
- **Scope trim, agreed during planning:** the original design's separate "draft autosave to a backend endpoint" is dropped for v1 — draw.io's own `autosave` postMessage events are kept in React state only, and the real backend write happens on the explicit accept/save action. Losing an in-progress, not-yet-accepted DFD edit on a page reload is an acceptable v1 UX for a short review step (falls back to the original AI-generated diagram), and this avoids building a whole draft-persistence path for a low-stakes case.

---

## File structure

**New:**
- `shared/src/dfd-layout.ts` — ported node-positioning algorithm (from `frontend/features/dfd/layout.ts`), used by the XML compiler.
- `shared/src/dfd-xml.ts` — `compileToDrawioXml()`, `extractFromDrawioXml()`, `checkDfdReferences()`.
- `shared/src/dfd-xml.test.ts` — compiler/extractor unit + round-trip tests.
- `frontend/public/drawio/` — vendored self-hosted draw.io static client.
- `frontend/public/drawio-shapes/dfd-shapes.xml` — custom draw.io shape library for our 7 node types + trust boundary.
- `frontend/features/dfd-editor/drawio-protocol.ts` — pure postMessage protocol functions (parse incoming events, build the load action, build the embed URL).
- `frontend/features/dfd-editor/drawio-protocol.test.ts` — protocol unit tests.
- `frontend/features/dfd-editor/DfdEditorFrame.tsx` — thin iframe/postMessage wrapper (view + edit modes); no dedicated automated test, see Task 9's note.

**Modified:**
- `shared/src/index.ts` — export the new `dfd-xml.ts` symbols.
- `shared/src/schemas/playground.ts` — drop `dfd` from `playgroundScenarioContentSchema`.
- `backend/prisma/schema.prisma` — `LabDfd.graphJson` → `drawioXml`; `PlaygroundGeneratedScenario` gets `dfdXml`.
- `backend/prisma/seed/seed.ts` — compile DFD JSON to XML at seed time.
- `backend/src/modules/catalog/catalog.service.ts` — read `drawioXml`, extract to `DfdGraph`.
- `backend/src/modules/playground/playground-generation.service.ts` — compile on generate, extract on read, new `updateScenarioDfd()`.
- `backend/src/modules/playground/playground.controller.ts` — new `PATCH scenarios/:scenarioId/dfd` route.
- `frontend/features/labs/LabShell.tsx` — swap `DfdViewer` for `DfdEditorFrame`, new `dfdSavePath` prop.
- `frontend/app/app/playground/[scenarioId]/page.tsx` — pass `dfdSavePath`.

**Deleted (Task 12, after everything else lands):**
- `frontend/features/dfd/DfdCanvas.tsx`, `DfdNode.tsx`, `DfdEdge.tsx`, `DfdBoundary.tsx`, `DfdInspector.tsx`, `DfdViewer.tsx`, `layout.ts`, `themes.ts`, `dfd.test.ts`, `dfd-types.ts`.

---

### Task 1: Port DFD layout algorithm into `shared/`

**Files:**
- Create: `shared/src/dfd-layout.ts`
- Test: `shared/src/dfd-layout.test.ts`
- Read (do not modify yet): `frontend/features/dfd/layout.ts`

**Interfaces:**
- Produces: `layoutGraph(graph: DfdGraph, gaps?: { colGap: number; rowGap: number }): { nodes: Map<string, Placed>; bounds: { minX: number; minY: number; maxX: number; maxY: number } }`, `type Placed = { id: string; x: number; y: number; w: number; h: number }`, `NODE_W = 168`, `NODE_H = 88`, `LAYOUT_GAPS = { colGap: 120, rowGap: 56 }`.

This is a straight port of the existing layered left-to-right layout algorithm (`layoutGraph` in `frontend/features/dfd/layout.ts`) into `shared/`, dropping only the isometric-specific `GAPS.iso` variant and the `clusterBoxes`/`boxGap` exports (those were for the old renderer's visual trust-boundary hulls; the new compiler determines boundary membership from the explicit `node.trustBoundary` field instead, so they aren't needed). **Do not delete or modify `frontend/features/dfd/layout.ts` in this task** — the current custom renderer still imports it and must keep working until Task 12, when the old renderer is deleted.

- [ ] **Step 1: Write the failing test**

```typescript
// shared/src/dfd-layout.test.ts
import { describe, expect, it } from "vitest";
import { layoutGraph, LAYOUT_GAPS, NODE_H, NODE_W } from "./dfd-layout";
import type { DfdGraph } from "./schemas/dfd";

const graph: DfdGraph = {
  version: "1.0",
  nodes: [
    { id: "a", type: "external_entity", label: "A", description: "", assets: [], metadata: {} },
    { id: "b", type: "process", label: "B", description: "", assets: [], metadata: {} },
    { id: "c", type: "data_store", label: "C", description: "", assets: [], metadata: {} },
  ],
  edges: [
    { id: "e1", source: "a", target: "b", label: "", protocol: "", data: [], trustBoundaryCrossing: false, metadata: {} },
    { id: "e2", source: "b", target: "c", label: "", protocol: "", data: [], trustBoundaryCrossing: false, metadata: {} },
  ],
  trustBoundaries: [],
};

describe("layoutGraph", () => {
  it("places nodes in increasing columns along the flow", () => {
    const { nodes } = layoutGraph(graph, LAYOUT_GAPS);
    const a = nodes.get("a")!;
    const b = nodes.get("b")!;
    const c = nodes.get("c")!;
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
    expect(a.w).toBe(NODE_W);
    expect(a.h).toBe(NODE_H);
  });

  it("computes bounds covering every placed node", () => {
    const { nodes, bounds } = layoutGraph(graph, LAYOUT_GAPS);
    for (const n of nodes.values()) {
      expect(n.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(n.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(n.x + n.w).toBeLessThanOrEqual(bounds.maxX);
      expect(n.y + n.h).toBeLessThanOrEqual(bounds.maxY);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && pnpm exec vitest run dfd-layout.test.ts`
Expected: FAIL — `Cannot find module './dfd-layout'`.

- [ ] **Step 3: Write the implementation**

```typescript
// shared/src/dfd-layout.ts
import type { DfdGraph } from "./schemas/dfd";

export const NODE_W = 168;
export const NODE_H = 88;
export const LAYOUT_GAPS = { colGap: 120, rowGap: 56 } as const;

export type Placed = { id: string; x: number; y: number; w: number; h: number };
export type Layout = {
  nodes: Map<string, Placed>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

/**
 * Layered left-to-right layout: column = longest path from a source node.
 * ponytail: no dagre. Threat-model DFDs are shallow and flow one direction.
 * Ported from the (now-deleted) custom renderer's layout.ts, dropping the
 * isometric-only gap variant — draw.io isn't isometric.
 */
export function layoutGraph(graph: DfdGraph, gaps: { colGap: number; rowGap: number } = LAYOUT_GAPS): Layout {
  const { colGap: COL_GAP, rowGap: ROW_GAP } = gaps;
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (edge.source === edge.target) continue;
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
  }

  // Real DFDs loop back — webhooks, callbacks, replication. Drop those
  // feedback edges via DFS before ranking, otherwise the node they return to
  // gets ranked ahead of the node that calls it.
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  const feedback = new Set<string>();
  const walk = (id: string) => {
    state.set(id, VISITING);
    for (const next of outgoing.get(id) ?? []) {
      const s = state.get(next);
      if (s === VISITING) feedback.add(`${id} ${next}`);
      else if (s !== DONE) walk(next);
    }
    state.set(id, DONE);
  };
  for (const node of graph.nodes) if ((incoming.get(node.id) ?? []).length === 0) walk(node.id);
  for (const node of graph.nodes) if (!state.has(node.id)) walk(node.id);

  const parents = new Map<string, string[]>();
  for (const node of graph.nodes) {
    parents.set(
      node.id,
      (incoming.get(node.id) ?? []).filter((src) => !feedback.has(`${src} ${node.id}`)),
    );
  }

  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const ps = parents.get(id) ?? [];
    const d = ps.length === 0 ? 0 : Math.max(...ps.map(depthOf)) + 1;
    depth.set(id, d);
    return d;
  };
  for (const node of graph.nodes) depthOf(node.id);

  const columns = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const d = depth.get(node.id)!;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d)!.push(node.id);
  }

  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const colHeight = tallest * NODE_H + (tallest - 1) * ROW_GAP;

  const nodes = new Map<string, Placed>();
  for (const [col, ids] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    const stackHeight = ids.length * NODE_H + (ids.length - 1) * ROW_GAP;
    const top = (colHeight - stackHeight) / 2;
    ids.forEach((id, row) => {
      nodes.set(id, {
        id,
        x: col * (NODE_W + COL_GAP),
        y: top + row * (NODE_H + ROW_GAP),
        w: NODE_W,
        h: NODE_H,
      });
    });
  }

  const placed = [...nodes.values()];
  return {
    nodes,
    bounds: {
      minX: Math.min(0, ...placed.map((p) => p.x)),
      minY: Math.min(0, ...placed.map((p) => p.y)),
      maxX: Math.max(0, ...placed.map((p) => p.x + p.w)),
      maxY: Math.max(0, ...placed.map((p) => p.y + p.h)),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shared && pnpm exec vitest run dfd-layout.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/src/dfd-layout.ts shared/src/dfd-layout.test.ts
git commit -m "Port DFD layout algorithm into shared for the draw.io compiler"
```

---

### Task 2: XML compiler — `compileToDrawioXml()`

**Files:**
- Create: `shared/src/dfd-xml.ts`
- Test: `shared/src/dfd-xml.test.ts`

**Interfaces:**
- Consumes: `layoutGraph`, `LAYOUT_GAPS`, `NODE_W`, `NODE_H` from `./dfd-layout` (Task 1); `DfdGraph`, `DfdNode`, `DfdNodeType` from `./schemas/dfd`.
- Produces: `compileToDrawioXml(graph: DfdGraph): string`.

The XML uses draw.io's `<object>`-wraps-`<mxCell>` convention: every node/edge/boundary is an `<object>` carrying our semantic fields as custom attributes (visible/editable in draw.io's own "Edit Data" panel), wrapping an `<mxCell>` that carries only visual concerns (style, geometry, source/target). A `dfdKind` attribute (`"node" | "edge" | "boundary"`) makes classification on the way back out (Task 3) unambiguous without needing to sniff style strings. Node type styling comes from the real, MIT-licensed `drawio-threatmodeling` library shapes (decoded and verified during planning) for the 4 direct matches; `service`, `queue`, and `third_party` reuse the closest shape with a distinguishing style tweak.

- [ ] **Step 1: Write the failing test**

```typescript
// shared/src/dfd-xml.test.ts
import { describe, expect, it } from "vitest";
import { compileToDrawioXml } from "./dfd-xml";
import type { DfdGraph } from "./schemas/dfd";

const graph: DfdGraph = {
  version: "1.0",
  nodes: [
    {
      id: "customer",
      type: "external_entity",
      label: "Customer <VIP>",
      description: 'Shopper "at home"',
      trustBoundary: "internet",
      assets: ["email", "session_cookie"],
      metadata: {},
    },
    {
      id: "storefront",
      type: "process",
      label: "Storefront",
      description: "",
      assets: [],
      metadata: {},
    },
  ],
  edges: [
    {
      id: "e-customer-storefront",
      source: "customer",
      target: "storefront",
      label: "Checkout request",
      protocol: "HTTPS",
      data: ["session_cookie", "cart"],
      trustBoundaryCrossing: true,
      metadata: {},
    },
  ],
  trustBoundaries: [{ id: "internet", label: "Internet", description: "Untrusted public network." }],
};

describe("compileToDrawioXml", () => {
  const xml = compileToDrawioXml(graph);

  it("wraps everything in a valid mxGraphModel/root", () => {
    expect(xml).toContain("<mxGraphModel");
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toContain('<mxCell id="1" parent="0"/>');
    expect(xml).toContain("</root></mxGraphModel>");
  });

  it("emits one object per node, edge, and trust boundary with stable ids", () => {
    expect(xml).toContain('<object id="customer"');
    expect(xml).toContain('<object id="storefront"');
    expect(xml).toContain('<object id="e-customer-storefront"');
    expect(xml).toContain('<object id="internet"');
  });

  it("stamps semantic fields as custom attributes, not just visual style", () => {
    expect(xml).toContain('dfdKind="node"');
    expect(xml).toContain('dfdType="external_entity"');
    expect(xml).toContain('dfdAssets="email,session_cookie"');
    expect(xml).toContain('dfdTrustBoundary="internet"');
    expect(xml).toContain('dfdKind="edge"');
    expect(xml).toContain('dfdProtocol="HTTPS"');
    expect(xml).toContain('dfdTrustBoundaryCrossing="1"');
    expect(xml).toContain('dfdKind="boundary"');
  });

  it("escapes XML-significant characters in labels and descriptions", () => {
    expect(xml).toContain("Customer &lt;VIP&gt;");
    expect(xml).toContain("Shopper &quot;at home&quot;");
    expect(xml).not.toContain("Customer <VIP>");
  });

  it("wires edge source/target to the real node ids", () => {
    expect(xml).toContain('source="customer" target="storefront"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && pnpm exec vitest run dfd-xml.test.ts`
Expected: FAIL — `Cannot find module './dfd-xml'`.

- [ ] **Step 3: Write the implementation**

```typescript
// shared/src/dfd-xml.ts
import { LAYOUT_GAPS, NODE_H, NODE_W, layoutGraph } from "./dfd-layout";
import type { DfdGraph, DfdNode, DfdNodeType } from "./schemas/dfd";

/**
 * draw.io mxGraph XML shapes for our 7 node types, per PLAYGROUND_PROJECT.md's
 * DFD notation. Styles for external_entity/process/data_store/trust boundary
 * are copied verbatim (decoded from base64) from the MIT-licensed
 * drawio-threatmodeling library (github.com/michenriksen/drawio-threatmodeling)
 * so the diagram matches an established DFD visual convention rather than one
 * we invented. service/queue/third_party have no direct match in that library
 * and reuse the closest shape with a distinguishing tweak.
 */
const SHAPE_STYLE: Record<DfdNodeType, string> = {
  external_entity: "rounded=0;whiteSpace=wrap;html=1;",
  process: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;",
  service: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;",
  data_store: "shape=partialRectangle;whiteSpace=wrap;html=1;left=0;right=0;fillColor=none;",
  queue: "shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;",
  third_party: "rounded=0;whiteSpace=wrap;html=1;dashed=1;",
  trust_boundary:
    "html=1;fontColor=#FF3333;fontStyle=1;align=left;verticalAlign=top;spacing=0;labelBorderColor=none;" +
    "fillColor=none;dashed=1;strokeWidth=2;strokeColor=#FF3333;spacingLeft=4;spacingTop=-3;",
};

const BOUNDARY_STYLE = SHAPE_STYLE.trust_boundary;
const EDGE_STYLE = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;";
const EDGE_CROSSING_STYLE = `${EDGE_STYLE}dashed=1;strokeColor=#FF3333;fontColor=#FF3333;`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** JSON → draw.io XML. Deterministic — no AI, no parsing library needed for
 *  this direction since we fully control the output shape. */
export function compileToDrawioXml(graph: DfdGraph): string {
  const layout = layoutGraph(graph, LAYOUT_GAPS);
  const cells: string[] = [];

  const boundaryMembers = new Map<string, DfdNode[]>();
  for (const node of graph.nodes) {
    if (!node.trustBoundary) continue;
    if (!boundaryMembers.has(node.trustBoundary)) boundaryMembers.set(node.trustBoundary, []);
    boundaryMembers.get(node.trustBoundary)!.push(node);
  }

  // Trust boundaries first so document order puts them behind nodes/edges
  // (draw.io z-orders by document order).
  graph.trustBoundaries.forEach((boundary, i) => {
    const members = boundaryMembers.get(boundary.id) ?? [];
    const rects = members.map((n) => layout.nodes.get(n.id)!).filter(Boolean);
    const box = rects.length
      ? {
          x: Math.min(...rects.map((r) => r.x)) - 40,
          y: Math.min(...rects.map((r) => r.y)) - 50,
          w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)) + 80,
          h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)) + 90,
        }
      : { x: 0, y: layout.bounds.maxY + 100 + i * 140, w: 200, h: 100 };
    cells.push(
      `<object id="${escapeXml(boundary.id)}" label="${escapeXml(boundary.label)}" dfdKind="boundary" ` +
        `dfdDescription="${escapeXml(boundary.description)}">` +
        `<mxCell style="${BOUNDARY_STYLE}" vertex="1" connectable="0" parent="1">` +
        `<mxGeometry x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" as="geometry"/>` +
        `</mxCell></object>`,
    );
  });

  for (const node of graph.nodes) {
    const pos = layout.nodes.get(node.id)!;
    cells.push(
      `<object id="${escapeXml(node.id)}" label="${escapeXml(node.label)}" dfdKind="node" dfdType="${node.type}" ` +
        `dfdDescription="${escapeXml(node.description)}" dfdAssets="${escapeXml(node.assets.join(","))}"` +
        (node.trustBoundary ? ` dfdTrustBoundary="${escapeXml(node.trustBoundary)}"` : "") +
        `><mxCell style="${SHAPE_STYLE[node.type]}" vertex="1" parent="1">` +
        `<mxGeometry x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" as="geometry"/>` +
        `</mxCell></object>`,
    );
  }

  for (const edge of graph.edges) {
    cells.push(
      `<object id="${escapeXml(edge.id)}" label="${escapeXml(edge.label)}" dfdKind="edge" ` +
        `dfdProtocol="${escapeXml(edge.protocol)}" dfdData="${escapeXml(edge.data.join(","))}" ` +
        `dfdTrustBoundaryCrossing="${edge.trustBoundaryCrossing ? "1" : "0"}">` +
        `<mxCell style="${edge.trustBoundaryCrossing ? EDGE_CROSSING_STYLE : EDGE_STYLE}" edge="1" parent="1" ` +
        `source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}">` +
        `<mxGeometry relative="1" as="geometry"/>` +
        `</mxCell></object>`,
    );
  }

  return (
    `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" ` +
    `fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}</root></mxGraphModel>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shared && pnpm exec vitest run dfd-xml.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/src/dfd-xml.ts shared/src/dfd-xml.test.ts
git commit -m "Add deterministic DfdGraph to draw.io XML compiler"
```

---

### Task 3: XML extractor — `extractFromDrawioXml()` + `checkDfdReferences()`

**Files:**
- Modify: `shared/src/dfd-xml.ts` (add to the file created in Task 2)
- Modify: `shared/src/dfd-xml.test.ts` (add to the file created in Task 2)
- Modify: `shared/package.json` (add `fast-xml-parser` dependency)
- Read: `backend/prisma/seed/labs/*.json` (all 9, for round-trip fixtures)

**Interfaces:**
- Consumes: `dfdGraphSchema` from `./schemas/dfd`; `compileToDrawioXml` from this same file (Task 2, for round-trip tests).
- Produces: `extractFromDrawioXml(xml: string): DfdGraph` (throws on unparseable/invalid XML), `checkDfdReferences(graph: DfdGraph, refs: { label: string; affectedNodeIds: string[]; affectedEdgeIds: string[] }[]): string[]`.

`extractFromDrawioXml` must handle two cases: cells that came from our compiler (wrapped in `<object dfdKind="...">`, carrying our custom attributes) and cells a user drew from scratch in the draw.io UI using our shape library (a bare `<mxCell>`, no `<object>` wrapper, no custom attributes) — those get best-effort defaults (type inferred from style, empty description/assets). `checkDfdReferences` is the small, generic referential check used by the playground DFD-edit endpoint (Task 10) to reject an edit that orphans a threat/issue reference — it does not duplicate `validateSeedReferences` (which works on `key`-based pre-mint seed data); it works on any already-UUID'd `{ affectedNodeIds, affectedEdgeIds }` list against a graph.

- [ ] **Step 1: Add the dependency**

```bash
cd shared && pnpm add fast-xml-parser@^5.10.1
```

- [ ] **Step 2: Write the failing tests**

```typescript
// shared/src/dfd-xml.test.ts — append to the file from Task 2
import { extractFromDrawioXml, checkDfdReferences } from "./dfd-xml";
import { dfdGraphSchema, labSeedSchema } from "./schemas/dfd"; // labSeedSchema re-exported via ./schemas/lab in real usage — see note below
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

describe("extractFromDrawioXml", () => {
  it("round-trips compile -> extract back to an equivalent graph", () => {
    const graph = dfdGraphSchema.parse({
      version: "1.0",
      nodes: [
        { id: "a", type: "external_entity", label: "A", description: "d", trustBoundary: "b1", assets: ["x", "y"] },
        { id: "b", type: "data_store", label: "B", description: "", assets: [] },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", label: "L", protocol: "HTTPS", data: ["x"], trustBoundaryCrossing: true },
      ],
      trustBoundaries: [{ id: "b1", label: "Boundary", description: "d2" }],
    });
    const extracted = extractFromDrawioXml(compileToDrawioXml(graph));
    expect(extracted).toEqual(graph);
  });

  it("infers a best-effort node from a bare mxCell with no object wrapper", () => {
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="freehand" value="New Node" style="ellipse;whiteSpace=wrap;html=1;" vertex="1" parent="1">' +
      '<mxGeometry x="0" y="0" width="80" height="80" as="geometry"/></mxCell>' +
      "</root></mxGraphModel>";
    const graph = extractFromDrawioXml(xml);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ id: "freehand", label: "New Node", type: "process" });
  });

  it("throws on XML with no mxGraphModel/root", () => {
    expect(() => extractFromDrawioXml("<not-a-diagram/>")).toThrow();
  });
});

describe("extractFromDrawioXml against every curated seed DFD", () => {
  const labsDir = path.resolve(__dirname, "../../backend/prisma/seed/labs");
  const files = readdirSync(labsDir).filter((f) => f.endsWith(".json"));

  it.each(files)("round-trips %s without losing referential integrity", (file) => {
    const seed = JSON.parse(readFileSync(path.join(labsDir, file), "utf-8"));
    const graph = dfdGraphSchema.parse(seed.dfd);
    const extracted = extractFromDrawioXml(compileToDrawioXml(graph));
    expect(extracted).toEqual(graph);
  });
});

describe("checkDfdReferences", () => {
  const graph = dfdGraphSchema.parse({
    version: "1.0",
    nodes: [{ id: "n1", type: "process", label: "N1" }],
    edges: [{ id: "e1", source: "n1", target: "n1" }],
    trustBoundaries: [],
  });

  it("passes when every reference resolves", () => {
    const errors = checkDfdReferences(graph, [
      { label: "threat X", affectedNodeIds: ["n1"], affectedEdgeIds: ["e1"] },
    ]);
    expect(errors).toEqual([]);
  });

  it("reports a reference to a node that no longer exists", () => {
    const errors = checkDfdReferences(graph, [
      { label: "threat X", affectedNodeIds: ["deleted-node"], affectedEdgeIds: [] },
    ]);
    expect(errors).toEqual(['threat X: unknown node "deleted-node"']);
  });
});
```

Note: fix the `labSeedSchema` import in the test file above — it isn't needed (remove that unused import) since the fixture round-trip test only needs `seed.dfd`, not the full seed schema.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd shared && pnpm exec vitest run dfd-xml.test.ts`
Expected: FAIL — `extractFromDrawioXml`/`checkDfdReferences` not exported.

- [ ] **Step 4: Write the implementation**

```typescript
// shared/src/dfd-xml.ts — append to the file from Task 2
import { XMLParser } from "fast-xml-parser";
import { dfdGraphSchema } from "./schemas/dfd";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "object" || name === "mxCell",
});

/** Reverse of SHAPE_STYLE, for cells a user drew freehand (no dfdType
 *  attribute because they came from the shape library, not our compiler).
 *  Order matters — more specific substrings are checked first. */
const STYLE_TO_TYPE: [string, DfdNodeType][] = [
  ["shape=partialRectangle", "data_store"],
  ["shape=process", "queue"],
  ["ellipse", "process"],
  ["dashed=1", "third_party"],
  ["rounded=0", "external_entity"],
];

function inferType(style: string): DfdNodeType {
  for (const [needle, type] of STYLE_TO_TYPE) if (style.includes(needle)) return type;
  return "process";
}

function splitList(value: unknown): string[] {
  const s = typeof value === "string" ? value : "";
  return s.length ? s.split(",").filter(Boolean) : [];
}

type RawAttrs = Record<string, unknown>;

/**
 * draw.io XML -> DfdGraph. Handles both our own compiled output (`<object
 * dfdKind="...">` wrapping an `<mxCell>`, carrying our semantic attributes)
 * and cells a user drew freehand from the shape library (a bare `<mxCell>`
 * with no wrapper or custom attributes) — those get best-effort defaults.
 * Always re-validates with dfdGraphSchema before returning: a malformed or
 * hand-edited file must fail loudly here, not deep inside a grading loop.
 */
export function extractFromDrawioXml(xml: string): DfdGraph {
  const doc = parser.parse(xml) as { mxGraphModel?: { root?: RawAttrs } };
  const root = doc.mxGraphModel?.root;
  if (!root) throw new Error("Not a valid draw.io diagram: missing mxGraphModel/root.");

  const objects = (root.object as RawAttrs[]) ?? [];
  const allCells = (root.mxCell as RawAttrs[]) ?? [];
  const wrappedCellIds = new Set(
    objects
      .map((o) => {
        const cellField = o.mxCell;
        const cell = Array.isArray(cellField) ? cellField[0] : cellField;
        return (cell as RawAttrs | undefined)?.["@_id"];
      })
      .filter(Boolean),
  );
  const bareCells = allCells.filter(
    (c) => c["@_id"] !== "0" && c["@_id"] !== "1" && !wrappedCellIds.has(c["@_id"]),
  );

  const nodes: Record<string, unknown>[] = [];
  const edges: Record<string, unknown>[] = [];
  const trustBoundaries: Record<string, unknown>[] = [];

  const handle = (attrs: RawAttrs, cell: RawAttrs) => {
    const id = String(attrs["@_id"] ?? cell["@_id"]);
    const label = String(attrs["@_label"] ?? cell["@_value"] ?? "");
    const style = String(cell["@_style"] ?? "");
    const kind = attrs["@_dfdKind"];

    if (kind === "boundary" || (!kind && cell["@_connectable"] === "0")) {
      trustBoundaries.push({ id, label, description: String(attrs["@_dfdDescription"] ?? "") });
      return;
    }
    if (kind === "edge" || cell["@_edge"] === "1") {
      edges.push({
        id,
        source: String(cell["@_source"] ?? ""),
        target: String(cell["@_target"] ?? ""),
        label,
        protocol: String(attrs["@_dfdProtocol"] ?? ""),
        data: splitList(attrs["@_dfdData"]),
        trustBoundaryCrossing: attrs["@_dfdTrustBoundaryCrossing"] === "1",
      });
      return;
    }
    nodes.push({
      id,
      type: (attrs["@_dfdType"] as string | undefined) ?? inferType(style),
      label,
      description: String(attrs["@_dfdDescription"] ?? ""),
      ...(attrs["@_dfdTrustBoundary"] ? { trustBoundary: String(attrs["@_dfdTrustBoundary"]) } : {}),
      assets: splitList(attrs["@_dfdAssets"]),
    });
  };

  for (const obj of objects) {
    const cellField = obj.mxCell;
    const cell = Array.isArray(cellField) ? cellField[0] : cellField;
    if (cell) handle(obj, cell as RawAttrs);
  }
  for (const cell of bareCells) {
    if (cell["@_vertex"] === "1" || cell["@_edge"] === "1") handle({}, cell);
  }

  return dfdGraphSchema.parse({ version: "1.0", nodes, edges, trustBoundaries });
}

/**
 * Generic referential check: does every affectedNodeIds/affectedEdgeIds
 * reference still resolve against this graph? Used to reject a DFD edit that
 * orphans a threat or architecture-issue reference. Deliberately NOT the same
 * function as validateSeedReferences (that operates on pre-mint, key-based
 * seed data) — this works on any already-UUID'd reference list.
 */
export function checkDfdReferences(
  graph: DfdGraph,
  refs: { label: string; affectedNodeIds: string[]; affectedEdgeIds: string[] }[],
): string[] {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edgeIds = new Set(graph.edges.map((e) => e.id));
  const errors: string[] = [];
  for (const ref of refs) {
    for (const id of ref.affectedNodeIds) if (!nodeIds.has(id)) errors.push(`${ref.label}: unknown node "${id}"`);
    for (const id of ref.affectedEdgeIds) if (!edgeIds.has(id)) errors.push(`${ref.label}: unknown edge "${id}"`);
  }
  return errors;
}
```

Also add the missing `DfdNodeType` type import at the top of `shared/src/dfd-xml.ts` if not already present from Task 2 (`import type { DfdGraph, DfdNode, DfdNodeType } from "./schemas/dfd";`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd shared && pnpm exec vitest run dfd-xml.test.ts`
Expected: PASS (all tests, including 9 curated-seed round-trip cases from `it.each`).

If any curated seed round-trip fails, read the diff carefully — the most likely cause is a `metadata` field mismatch (both schemas default it to `{}`; the extractor doesn't set it explicitly and relies on `dfdGraphSchema.parse()` to fill the default — confirm the original seed's `metadata` is also `{}` or absent, not a populated object, since arbitrary `metadata` isn't round-tripped through the XML in this v1).

- [ ] **Step 6: Commit**

```bash
git add shared/src/dfd-xml.ts shared/src/dfd-xml.test.ts shared/package.json shared/pnpm-lock.yaml
git commit -m "Add draw.io XML extractor and DFD reference checker"
```

---

### Task 4: Export from `shared/` index, run the shared package gate

**Files:**
- Modify: `shared/src/index.ts`

**Interfaces:**
- Produces: `compileToDrawioXml`, `extractFromDrawioXml`, `checkDfdReferences`, `layoutGraph`, `NODE_W`, `NODE_H`, `LAYOUT_GAPS` all importable from `@curated-labs/shared`.

- [ ] **Step 1: Add the exports**

```typescript
// shared/src/index.ts — add these two lines after the existing schema exports
export * from "./dfd-layout";
export * from "./dfd-xml";
```

- [ ] **Step 2: Build and verify**

Run: `cd shared && pnpm build && pnpm typecheck && pnpm test`
Expected: build succeeds, typecheck clean, all tests pass (existing + the new `dfd-layout.test.ts`/`dfd-xml.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add shared/src/index.ts
git commit -m "Export DFD compile/extract layer from shared package"
```

---

### Task 5: Prisma schema — `LabDfd.drawioXml`, `PlaygroundGeneratedScenario.dfdXml`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `shared/src/schemas/playground.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LabDfd.drawioXml: string` (Prisma), `PlaygroundGeneratedScenario.dfdXml: string` (Prisma), `playgroundScenarioContentSchema` without a `dfd` field.

- [ ] **Step 1: Drop `dfd` from the playground content schema**

In `shared/src/schemas/playground.ts`, remove the `dfd: dfdGraphSchema,` line from `playgroundScenarioContentSchema`. The `dfdGraphSchema` import may become unused in this file — remove it if so (check with `grep -n dfdGraphSchema shared/src/schemas/playground.ts` after the edit).

- [ ] **Step 2: Edit the Prisma schema**

In `backend/prisma/schema.prisma`:

```prisma
model LabDfd {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  labId           String   @map("lab_id") @db.Uuid
  version         Int      @default(1)
  drawioXml       String   @map("drawio_xml")
  previewAssetUrl String?  @map("preview_asset_url")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  lab Lab @relation(fields: [labId], references: [id], onDelete: Cascade)

  @@unique([labId, version])
  @@index([labId], map: "idx_lab_dfds_lab")
  @@map("lab_dfds")
}
```

(Only the `graphJson Json @map("graph_json")` line changes, to `drawioXml String @map("drawio_xml")` — everything else in the model is unchanged.)

In `model PlaygroundGeneratedScenario`, add one field next to `contentJson`:

```prisma
  contentJson   Json     @map("content_json")
  dfdXml        String   @map("dfd_xml")
```

- [ ] **Step 3: Generate and review the migration**

Follow the same discipline used for the earlier Playground migrations this session — `--create-only`, read the SQL, then `migrate deploy`:

```bash
cd backend
pnpm exec prisma validate
pnpm exec prisma migrate dev --create-only --name drawio_dfd_storage
```

Read the generated `backend/prisma/migrations/<timestamp>_drawio_dfd_storage/migration.sql`. Expected: a `DROP COLUMN "graph_json"` + `ADD COLUMN "drawio_xml"` on `lab_dfds` (Prisma diffs a field rename as drop+add when there's no data-preserving path it can infer — fine here, this project is pre-production and `db:seed` will repopulate the column in Task 6), and an `ADD COLUMN "dfd_xml"` on `playground_generated_scenarios`. If you see anything beyond those column changes (e.g. a table drop), stop and re-check the schema edit.

- [ ] **Step 4: Apply and regenerate the client**

```bash
pnpm exec prisma migrate deploy
pnpm --filter @curated-labs/backend db:generate
```

- [ ] **Step 5: Verify**

Run: `cd shared && pnpm build && cd ../backend && pnpm exec tsc --noEmit -p .`
Expected: shared builds; backend typecheck will FAIL at this point (`catalog.service.ts` and `playground-generation.service.ts` still reference `graphJson`/`content.dfd`) — that's expected, fixed in Tasks 6 and 9. Confirm the failures are exactly in those two files and nowhere else.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations shared/src/schemas/playground.ts
git commit -m "Migrate DFD storage to draw.io XML (LabDfd, PlaygroundGeneratedScenario)"
```

---

### Task 6: `seed.ts` compiles DFD JSON to XML at seed time

**Files:**
- Modify: `backend/prisma/seed/seed.ts`

**Interfaces:**
- Consumes: `compileToDrawioXml` from `@curated-labs/shared` (Task 2/4).

Curated lab seed files keep their existing `dfd: DfdGraph` JSON shape — no changes to the 9 files in `backend/prisma/seed/labs/`. `seed.ts` compiles that JSON to XML right before the DB write, so the JSON-authoring workflow curators already use is untouched, and the DB still ends up XML-only per the storage rule.

- [ ] **Step 1: Find and update the DFD write site**

Run: `grep -n "graphJson\|labDfd.create\|labDfd\.\w*create" backend/prisma/seed/seed.ts`

Wherever `seed.ts` currently does something like:

```typescript
await prisma.labDfd.create({
  data: { labId: lab.id, version: 1, graphJson: labSeed.dfd as object },
});
```

change it to:

```typescript
import { compileToDrawioXml } from "@curated-labs/shared"; // add to the existing import block

await prisma.labDfd.create({
  data: { labId: lab.id, version: 1, drawioXml: compileToDrawioXml(labSeed.dfd) },
});
```

- [ ] **Step 2: Re-seed and verify**

```bash
cd backend
pnpm db:seed
```

Expected: completes without error for all 9 labs.

```bash
pnpm exec prisma studio
```

Open one `lab_dfds` row and confirm `drawio_xml` contains real `<mxGraphModel>...` XML (not empty, not JSON).

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/seed/seed.ts
git commit -m "Compile curated lab DFDs to draw.io XML at seed time"
```

---

### Task 7: `catalog.service.ts` reads `drawioXml`, extracts to `DfdGraph`

**Files:**
- Modify: `backend/src/modules/catalog/catalog.service.ts:112,145` (exact lines found during planning)

**Interfaces:**
- Consumes: `extractFromDrawioXml` from `@curated-labs/shared`.

- [ ] **Step 1: Update the Prisma select and the parse call**

At line 112, change:

```typescript
dfds: { orderBy: { version: "desc" }, take: 1, select: { graphJson: true, version: true } },
```

to:

```typescript
dfds: { orderBy: { version: "desc" }, take: 1, select: { drawioXml: true, version: true } },
```

At line 145, change:

```typescript
dfd: dfdGraphSchema.parse(dfd.graphJson),
```

to:

```typescript
dfd: extractFromDrawioXml(dfd.drawioXml),
```

Update the import at the top of the file: replace `dfdGraphSchema` with `extractFromDrawioXml` if `dfdGraphSchema` isn't used elsewhere in this file (`grep -n dfdGraphSchema backend/src/modules/catalog/catalog.service.ts` to check).

- [ ] **Step 2: Verify**

Run: `cd backend && pnpm exec tsc --noEmit -p .`
Expected: `catalog.service.ts` no longer errors (playground-generation.service.ts errors from Task 5 remain until Task 10).

Run the existing backend test suite: `pnpm exec vitest run`
Expected: no regressions (catalog tests, if any, still pass — this is a read-path change with an equivalent output shape).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/catalog/catalog.service.ts
git commit -m "Read curated lab DFDs from draw.io XML"
```

---

### Task 8: Vendor the self-hosted draw.io client + custom shape library

**Files:**
- Create: `frontend/public/drawio/` (vendored static assets)
- Create: `frontend/public/drawio-shapes/dfd-shapes.xml`

**Interfaces:**
- Produces: a same-origin `/drawio/index.html` the app can embed via iframe; a `/drawio-shapes/dfd-shapes.xml` shape library file draw.io can load.

- [ ] **Step 1: Download and vendor a pinned draw.io release**

The `jgraph/drawio` repo ships its built static web client at `src/main/webapp/` — the `draw.war` release asset is that same folder packaged as a plain zip (Java/Tomcat is only needed if you want the WAR's servlet features; we don't, we're serving static files ourselves). Pin to a specific tag for reproducibility rather than tracking `main`.

```bash
mkdir -p frontend/public/drawio
curl -L -o /tmp/draw.war https://github.com/jgraph/drawio/releases/download/v31.1.8/draw.war
cd frontend/public/drawio
unzip -q /tmp/draw.war -x "WEB-INF/*" "META-INF/*"
cd -
rm /tmp/draw.war
```

Verify: `ls frontend/public/drawio/index.html` exists, and `du -sh frontend/public/drawio` is on the order of tens of MB (this is a full editor client — expected size, it's a static asset served from `/public`, not part of the JS bundle).

Add a short note to `frontend/public/drawio/VENDORED.md`:

```markdown
Vendored from jgraph/drawio v31.1.8 (draw.war, WEB-INF/META-INF stripped).
To update: repeat the download/unzip steps in the DFD editor implementation
plan (docs/superpowers/plans/2026-08-10-drawio-dfd-editor.md, Task 8) with a
newer tag.
```

- [ ] **Step 2: Build the custom shape library**

Create `frontend/public/drawio-shapes/dfd-shapes.xml` as a draw.io "library" file (the same `<mxlibrary>[...]` format used by `drawio-threatmodeling`, MIT-licensed, referenced during planning) with exactly our 7 node types + boundary, using the same style strings as `SHAPE_STYLE` in `shared/src/dfd-xml.ts` so a shape dragged from the palette visually matches a compiled one:

```xml
<mxlibrary>[
  {"xml":"<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"2\" value=\"External Entity\" style=\"rounded=0;whiteSpace=wrap;html=1;\" vertex=\"1\" parent=\"1\"><mxGeometry width=\"120\" height=\"60\" as=\"geometry\"/></mxCell></root></mxGraphModel>","w":120,"h":60,"aspect":"fixed","title":"External Entity"},
  {"xml":"<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"2\" value=\"Process\" style=\"ellipse;whiteSpace=wrap;html=1;aspect=fixed;\" vertex=\"1\" parent=\"1\"><mxGeometry width=\"80\" height=\"80\" as=\"geometry\"/></mxCell></root></mxGraphModel>","w":80,"h":80,"aspect":"fixed","title":"Process"},
  {"xml":"<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"2\" value=\"Service\" style=\"ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;\" vertex=\"1\" parent=\"1\"><mxGeometry width=\"80\" height=\"80\" as=\"geometry\"/></mxCell></root></mxGraphModel>","w":80,"h":80,"aspect":"fixed","title":"Service"},
  {"xml":"<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"2\" value=\"Data Store\" style=\"shape=partialRectangle;whiteSpace=wrap;html=1;left=0;right=0;fillColor=none;\" vertex=\"1\" parent=\"1\"><mxGeometry width=\"120\" height=\"60\" as=\"geometry\"/></mxCell></root></mxGraphModel>","w":120,"h":60,"aspect":"fixed","title":"Data Store"},
  {"xml":"<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"2\" value=\"Queue\" style=\"shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;\" vertex=\"1\" parent=\"1\"><mxGeometry width=\"120\" height=\"60\" as=\"geometry\"/></mxCell></root></mxGraphModel>","w":120,"h":60,"aspect":"fixed","title":"Queue"},
  {"xml":"<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"2\" value=\"Third Party\" style=\"rounded=0;whiteSpace=wrap;html=1;dashed=1;\" vertex=\"1\" parent=\"1\"><mxGeometry width=\"120\" height=\"60\" as=\"geometry\"/></mxCell></root></mxGraphModel>","w":120,"h":60,"aspect":"fixed","title":"Third Party"},
  {"xml":"<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"2\" value=\"Trust Boundary\" style=\"html=1;fontColor=#FF3333;fontStyle=1;align=left;verticalAlign=top;spacing=0;labelBorderColor=none;fillColor=none;dashed=1;strokeWidth=2;strokeColor=#FF3333;spacingLeft=4;spacingTop=-3;\" vertex=\"1\" connectable=\"0\" parent=\"1\"><mxGeometry width=\"290\" height=\"140\" as=\"geometry\"/></mxCell></root></mxGraphModel>","w":290,"h":140,"aspect":"fixed","title":"Trust Boundary"}
]</mxlibrary>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/public/drawio frontend/public/drawio-shapes
git commit -m "Vendor self-hosted draw.io client and custom DFD shape library"
```

Note: this is a large, mostly-binary/generated commit (a full static web app). If the repo's diff review tooling struggles with it, that's expected and fine — nothing in `frontend/public/drawio/` is hand-edited.

---

### Task 9: `DfdEditorFrame.tsx` — iframe/postMessage wrapper

**Files:**
- Create: `frontend/features/dfd-editor/drawio-protocol.ts`
- Test: `frontend/features/dfd-editor/drawio-protocol.test.ts`
- Create: `frontend/features/dfd-editor/DfdEditorFrame.tsx`

**Interfaces:**
- Consumes: `compileToDrawioXml` from `@curated-labs/shared`; the vendored assets at `/drawio/index.html` and `/drawio-shapes/dfd-shapes.xml` (Task 8).
- Produces: `parseDrawioMessage(raw: unknown): DrawioEvent | null`, `loadAction(xml: string): { action: "load"; xml: string; autosave: number }`, `embedUrl(mode: "view" | "edit"): string` — all pure, from `drawio-protocol.ts`. `<DfdEditorFrame graph={DfdGraph} mode="view" | "edit" onSelectionChange={(sel: DfdSelection) => void} onSave={(xml: string) => void | Promise<void>} />` — matches `DfdViewer`'s existing `graph`/`onSelectionChange` props (Task 11 swaps it in with minimal churn) plus the two new props.

**Note on approach:** this codebase has no React component-rendering test infrastructure at all — `frontend/package.json` has no `@testing-library/react` and the one existing frontend test file (`dfd.test.ts`, deleted in Task 12) tests pure functions only. Rather than adding a new testing dependency for this one component, the actual postMessage protocol logic (parsing incoming events, building the reply, building the embed URL) is factored into pure functions in `drawio-protocol.ts` and unit-tested directly, matching the codebase's existing pure-function-test convention (`dfd-xml.test.ts`, `workflow.test.ts`). `DfdEditorFrame.tsx` itself is a thin wrapper with no dedicated automated test — its correctness is confirmed by Task 13's manual verification pass (load/edit/save/view-only), the same way this codebase verifies other UI it can't unit test (see the Custom Playground work earlier this session).

draw.io's embed `postMessage` protocol (`init` → we send `load`, user edits, `save`/`autosave`/`exit` events come back) is stable and has been unchanged for years. The one piece to verify once the vendored client is in place: the exact query-string flags for a genuinely read-only "view" mode (`chromeless=1&edit=0` below is a real, documented starting point, but confirm it against the vendored build's own bundled docs/example files — `frontend/public/drawio/index.html`'s supported query params, or search the vendored assets for `PostMessageEvents` — before trusting it blindly, since exact flag behavior can shift slightly between releases).

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/features/dfd-editor/drawio-protocol.test.ts
import { describe, expect, it } from "vitest";
import { embedUrl, loadAction, parseDrawioMessage } from "./drawio-protocol";

describe("parseDrawioMessage", () => {
  it("parses a JSON string event", () => {
    expect(parseDrawioMessage(JSON.stringify({ event: "save", xml: "<x/>" }))).toEqual({
      event: "save",
      xml: "<x/>",
    });
  });

  it("passes through an already-parsed object", () => {
    expect(parseDrawioMessage({ event: "init" })).toEqual({ event: "init" });
  });

  it("returns null for unparseable input", () => {
    expect(parseDrawioMessage("not json")).toBeNull();
  });

  it("returns null for a JSON value with no event field", () => {
    expect(parseDrawioMessage(JSON.stringify({ foo: "bar" }))).toBeNull();
  });
});

describe("loadAction", () => {
  it("builds a load action carrying the compiled XML", () => {
    expect(loadAction("<mxGraphModel/>")).toEqual({ action: "load", xml: "<mxGraphModel/>", autosave: 1 });
  });
});

describe("embedUrl", () => {
  it("adds chromeless/edit=0 for view mode", () => {
    const url = embedUrl("view");
    expect(url).toContain("chromeless=1");
    expect(url).toContain("edit=0");
  });

  it("omits chromeless flags for edit mode", () => {
    const url = embedUrl("edit");
    expect(url).not.toContain("chromeless");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm exec vitest run drawio-protocol.test.ts`
Expected: FAIL — `Cannot find module './drawio-protocol'`.

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/features/dfd-editor/drawio-protocol.ts

/** draw.io embed postMessage event shapes (proto=json). Stable across
 *  releases — see https://www.drawio.com/doc/faq/embed-mode (or the
 *  vendored client's own bundled docs) for the authoritative reference. */
export type DrawioEvent =
  | { event: "init" }
  | { event: "save"; xml: string }
  | { event: "autosave"; xml: string }
  | { event: "select"; cells?: { id: string }[] }
  | { event: "exit" };

export function parseDrawioMessage(raw: unknown): DrawioEvent | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object" && typeof (data as { event?: unknown }).event === "string") {
      return data as DrawioEvent;
    }
    return null;
  } catch {
    return null;
  }
}

export function loadAction(xml: string): { action: "load"; xml: string; autosave: number } {
  return { action: "load", xml, autosave: 1 };
}

/** `chromeless=1&edit=0` is a real, documented draw.io view-only combination
 *  — verify it renders as expected against the vendored v31.1.8 build once
 *  Task 8 is in place, per the note above this task. */
export function embedUrl(mode: "view" | "edit"): string {
  const params = new URLSearchParams({
    embed: "1",
    proto: "json",
    spin: "1",
    libraries: "1",
    ...(mode === "view" ? { chromeless: "1", edit: "0" } : {}),
  });
  return `/drawio/index.html?${params.toString()}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm exec vitest run drawio-protocol.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write `DfdEditorFrame.tsx`** (thin wrapper, no dedicated test — see note above)

```tsx
// frontend/features/dfd-editor/DfdEditorFrame.tsx
"use client";

import { useEffect, useRef } from "react";
import { compileToDrawioXml, type DfdGraph, type DfdSelection } from "@curated-labs/shared";
import { embedUrl, loadAction, parseDrawioMessage } from "./drawio-protocol";

export function DfdEditorFrame({
  graph,
  mode,
  onSelectionChange,
  onSave,
}: {
  graph: DfdGraph;
  mode: "view" | "edit";
  onSelectionChange: (selection: DfdSelection) => void;
  /** Called with the raw draw.io XML on save. Extraction and referential
   *  validation happen server-side (PATCH .../dfd) — never trust a
   *  client-derived DfdGraph for the authoritative check. */
  onSave?: (xml: string) => void | Promise<void>;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
  }, [graph, mode]);

  useEffect(() => {
    function handleMessage(evt: MessageEvent) {
      if (evt.source !== frameRef.current?.contentWindow) return;
      const data = parseDrawioMessage(evt.data);
      if (!data) return;

      if (data.event === "init" && !loadedRef.current) {
        loadedRef.current = true;
        frameRef.current?.contentWindow?.postMessage(JSON.stringify(loadAction(compileToDrawioXml(graph))), "*");
      } else if (data.event === "save" && mode === "edit") {
        onSave?.(data.xml);
      } else if (data.event === "select") {
        onSelectionChange(null); // no per-cell inspector yet — draw.io's own UI covers selection detail
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [graph, mode, onSave, onSelectionChange]);

  return (
    <iframe
      ref={frameRef}
      title="DFD diagram"
      src={embedUrl(mode)}
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/features/dfd-editor
git commit -m "Add DfdEditorFrame: postMessage wrapper around the embedded draw.io editor"
```

---

### Task 10: Playground DFD edit endpoint

**Files:**
- Modify: `backend/src/modules/playground/playground-generation.service.ts`
- Modify: `backend/src/modules/playground/playground.controller.ts`
- Test: `backend/tests/playground-dfd-edit.test.ts` (new)

**Interfaces:**
- Consumes: `extractFromDrawioXml`, `checkDfdReferences`, `compileToDrawioXml` from `@curated-labs/shared` (Tasks 2–4).
- Produces: `PlaygroundGenerationService.updateScenarioDfd(user: AuthContext, scenarioId: string, drawioXml: string): Promise<void>`, `PATCH /playground/scenarios/:scenarioId/dfd`.

- [ ] **Step 1: Fix `persist()` to compile and store XML instead of raw JSON**

In `playground-generation.service.ts`, in `persist()` (around line 219), the `content` object currently includes `dfd: draft.dfd,`. Remove that line (the schema no longer has the field), and separately compute the XML:

```typescript
const dfdXml = compileToDrawioXml(draft.dfd);
const content: PlaygroundScenarioContent = playgroundScenarioContentSchema.parse({
  lab: draft.lab,
  architectureIssues: draft.architectureIssues.map((i) => ({ /* unchanged */ })),
  // ...rest unchanged, just without the `dfd:` line
});
```

Then in the `tx.playgroundGeneratedScenario.create({ data: {...} })` call, add `dfdXml,` alongside `contentJson: content as object,`.

- [ ] **Step 2: Fix `getScenario()` to extract from XML**

Around line 335, replace:

```typescript
dfd: dfdGraphSchema.parse(content.dfd),
```

with:

```typescript
dfd: extractFromDrawioXml(scenario.dfdXml),
```

(`scenario` is already fetched earlier in this method via `this.prisma.playgroundGeneratedScenario.findUnique`.) Update the top-of-file import: add `extractFromDrawioXml`, `compileToDrawioXml`, `checkDfdReferences` to the existing `@curated-labs/shared` import; remove `dfdGraphSchema` if it becomes unused (`grep -n dfdGraphSchema` in this file to check — it may still be needed elsewhere).

- [ ] **Step 3: Add `updateScenarioDfd()`**

```typescript
/** Owner-only. Re-validates that every threat/architecture-issue reference
 *  still resolves before accepting the edit — the same referential-integrity
 *  bar validateGeneratedScenario applies at generation time, re-applied here
 *  because the learner can now change the DFD after generation. */
async updateScenarioDfd(user: AuthContext, scenarioId: string, drawioXml: string): Promise<void> {
  const scenario = await this.prisma.playgroundGeneratedScenario.findUnique({ where: { id: scenarioId } });
  if (!scenario || scenario.userId !== user.userId) throw new NotFoundException("Scenario not found.");

  let graph;
  try {
    graph = extractFromDrawioXml(drawioXml);
  } catch {
    throw new BadRequestException("Couldn't read that diagram.");
  }

  const content = playgroundScenarioContentSchema.parse(scenario.contentJson);
  const errors = checkDfdReferences(graph, [
    ...content.architectureIssues.map((i) => ({
      label: `architecture issue "${i.title}"`,
      affectedNodeIds: i.affectedNodeIds,
      affectedEdgeIds: i.affectedEdgeIds,
    })),
    ...content.threats.map((t) => ({
      label: `threat "${t.title}"`,
      affectedNodeIds: t.affectedNodeIds,
      affectedEdgeIds: t.affectedEdgeIds,
    })),
  ]);
  if (errors.length) {
    throw new BadRequestException(`That edit removes something a threat or issue still points at: ${errors[0]}`);
  }

  // Prisma field is `dfdXml` on this model (LabDfd's is `drawioXml` — the two
  // models were named independently in Task 5; don't cross the names).
  await this.prisma.playgroundGeneratedScenario.update({ where: { id: scenarioId }, data: { dfdXml: drawioXml } });
}
```

Add `BadRequestException` to the `@nestjs/common` import if not already present.

- [ ] **Step 4: Add the controller route**

In `playground.controller.ts`, add:

```typescript
import { Patch } from "@nestjs/common"; // add to existing import

const updateDfdSchema = z.object({ drawioXml: z.string().min(1) });

// ...inside the class, alongside the other routes:
@Patch("scenarios/:scenarioId/dfd")
updateDfd(
  @CurrentUser() user: AuthContext,
  @Param("scenarioId") scenarioId: string,
  @Body(new ZodValidationPipe(updateDfdSchema)) body: { drawioXml: string },
) {
  return this.generation.updateScenarioDfd(user, scenarioId, body.drawioXml);
}
```

- [ ] **Step 5: Write the test**

```typescript
// backend/tests/playground-dfd-edit.test.ts
import { describe, expect, it } from "vitest";
import { checkDfdReferences, compileToDrawioXml, extractFromDrawioXml, dfdGraphSchema } from "@curated-labs/shared";

// Exercises the same compile -> extract -> checkDfdReferences path
// updateScenarioDfd() runs, without needing a live database.
describe("playground DFD edit validation path", () => {
  const graph = dfdGraphSchema.parse({
    version: "1.0",
    nodes: [
      { id: "n1", type: "process", label: "N1" },
      { id: "n2", type: "data_store", label: "N2" },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    trustBoundaries: [],
  });
  const refs = [{ label: 'threat "SQLi"', affectedNodeIds: ["n2"], affectedEdgeIds: ["e1"] }];

  it("accepts an edit that keeps every referenced node/edge", () => {
    const edited = extractFromDrawioXml(compileToDrawioXml(graph));
    expect(checkDfdReferences(edited, refs)).toEqual([]);
  });

  it("rejects an edit that deletes a referenced node", () => {
    const withoutN2 = { ...graph, nodes: graph.nodes.filter((n) => n.id !== "n2"), edges: [] };
    const edited = extractFromDrawioXml(compileToDrawioXml(withoutN2));
    const errors = checkDfdReferences(edited, refs);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("SQLi");
  });
});
```

- [ ] **Step 6: Run tests and typecheck**

Run: `cd backend && pnpm exec vitest run playground-dfd-edit.test.ts && pnpm exec tsc --noEmit -p .`
Expected: new test passes; `playground-generation.service.ts` no longer has type errors (the remaining errors from Task 5's step 5 are now resolved). Also run the full backend suite (`pnpm exec vitest run`) to confirm no regressions in the existing `playground-*.test.ts` files.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/playground backend/tests/playground-dfd-edit.test.ts
git commit -m "Add playground scenario DFD edit endpoint with referential re-validation"
```

---

### Task 11: Wire `DfdEditorFrame` into `LabShell.tsx`

**Files:**
- Modify: `frontend/features/labs/LabShell.tsx`
- Modify: `frontend/app/app/playground/[scenarioId]/page.tsx`

**Interfaces:**
- Consumes: `DfdEditorFrame` from `../dfd-editor/DfdEditorFrame` (Task 9).
- Produces: `LabShell` gains one new optional prop, `dfdSavePath?: string`.

- [ ] **Step 1: Swap the import and the render**

In `LabShell.tsx`, replace:

```typescript
import { DfdViewer } from "@/features/dfd/DfdViewer";
```

with:

```typescript
import { DfdEditorFrame } from "@/features/dfd-editor/DfdEditorFrame";
```

Add the new prop to the `LabShell` signature, alongside the existing `startPath`/`attemptBase`/`backHref`:

```typescript
export function LabShell({
  lab,
  attemptId: initialAttemptId,
  startPath = `/labs/${lab.id}/attempts`,
  attemptBase = "/attempts",
  backHref = "/app/catalog",
  /** Present only for an unaccepted Playground scenario review. When set,
   *  the DFD panel is editable (until an attempt exists) and PATCHes here
   *  on save. Omitted for curated labs and already-started attempts, where
   *  the panel is always view-only. */
  dfdSavePath,
}: {
  lab: LabDetail;
  attemptId?: string;
  startPath?: string;
  attemptBase?: string;
  backHref?: string;
  dfdSavePath?: string;
}) {
```

Replace the render at the `DfdViewer` call site:

```tsx
<DfdEditorFrame
  graph={lab.dfd}
  mode={dfdSavePath && !attemptId ? "edit" : "view"}
  onSelectionChange={setSelection}
  onSave={
    dfdSavePath
      ? async (xml) => {
          await api(dfdSavePath, { method: "PATCH", body: JSON.stringify({ drawioXml: xml }) });
        }
      : undefined
  }
/>
```

- [ ] **Step 2: Pass `dfdSavePath` from the playground scenario page**

In `frontend/app/app/playground/[scenarioId]/page.tsx`, add to the `<LabShell>` call:

```tsx
<LabShell
  lab={scenario}
  attemptId={scenario.attempt?.id}
  startPath={`/playground/scenarios/${scenario.id}/attempts`}
  attemptBase="/playground/attempts"
  backHref="/app/playground"
  dfdSavePath={`/playground/scenarios/${scenario.id}/dfd`}
/>
```

Curated lab pages (wherever `LabShell` is otherwise invoked — `grep -rn "<LabShell" frontend/app` to confirm the other call site) get no `dfdSavePath`, so they default to view-only, matching the scope note in Global Constraints.

- [ ] **Step 3: Verify**

Run: `cd frontend && pnpm exec tsc --noEmit -p . && pnpm exec vitest run`
Expected: clean typecheck, all existing frontend tests pass (`grep -rn "DfdViewer" frontend` should now return zero results outside the soon-to-be-deleted `frontend/features/dfd/` directory).

- [ ] **Step 4: Commit**

```bash
git add frontend/features/labs/LabShell.tsx frontend/app/app/playground/[scenarioId]/page.tsx
git commit -m "Wire DfdEditorFrame into LabShell, replacing the custom DFD viewer"
```

---

### Task 12: Delete the old custom DFD renderer

**Files:**
- Delete: `frontend/features/dfd/DfdCanvas.tsx`, `DfdNode.tsx`, `DfdEdge.tsx`, `DfdBoundary.tsx`, `DfdInspector.tsx`, `DfdViewer.tsx`, `layout.ts`, `themes.ts`, `dfd.test.ts`, `dfd-types.ts`

**Interfaces:** none — this is pure deletion, gated on Task 11 having removed the last consumer.

- [ ] **Step 1: Confirm nothing still references the old renderer**

Run: `grep -rn "features/dfd/" frontend --include="*.ts" --include="*.tsx" | grep -v "features/dfd-editor"`
Expected: zero results. If anything shows up, stop — find and update that reference first (it means Task 11 missed a call site).

- [ ] **Step 2: Delete the directory**

```bash
git rm -r frontend/features/dfd
```

- [ ] **Step 3: Verify**

Run: `cd frontend && pnpm exec tsc --noEmit -p . && pnpm exec vitest run`
Expected: clean typecheck, all tests pass (the deleted `dfd.test.ts` is gone; its coverage is superseded by `shared/src/dfd-xml.test.ts`'s curated-seed round-trip tests from Task 3, which assert the same referential-integrity property against the same fixture files).

- [ ] **Step 4: Commit**

```bash
git commit -m "Delete the custom DFD renderer, superseded by the embedded draw.io editor"
```

---

### Task 13: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

```bash
pnpm -r typecheck
pnpm -r test
```

Expected: everything green — `shared` (existing + new `dfd-layout`/`dfd-xml` tests), `backend` (existing + new `playground-dfd-edit.test.ts`), `frontend` (existing + new `DfdEditorFrame.test.tsx`, minus the deleted `dfd.test.ts`).

- [ ] **Step 2: Manual/screenshot verification**

Start both dev servers (`pnpm dev`), then, matching the verification approach already used for Custom Playground:
1. Load a curated lab detail page — confirm the DFD renders (view-only) inside the embedded draw.io frame, no console errors.
2. Generate a Custom Playground scenario, open its review page — confirm the DFD is editable, move a node, click save, confirm the PATCH succeeds (network tab, 200/204) and reload shows the moved node persisted.
3. On the same review page, delete a node that a threat references, save — confirm the PATCH is rejected (400) with a message naming the threat, and the DFD is NOT silently corrupted (still shows the deleted node, since the save failed).
4. Start the playground attempt (locks the DFD) — confirm the panel switches to view-only (`mode="view"`, no save affordance) once `attemptId` is set.

- [ ] **Step 3: Report results, no commit needed for this task**
