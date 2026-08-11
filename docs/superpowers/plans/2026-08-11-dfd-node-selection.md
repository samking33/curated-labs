# DFD Node/Edge Selection + Details Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a node or edge in the embedded DFD editor shows its details in a panel on our page, in both view-only and edit mode.

**Architecture:** A same-origin bridge script (validated live during planning) intercepts draw.io's real `EditorUi` construction, taps the actual mxGraph selection API, and forwards real selection-changed events to the parent frame via `postMessage`. The parent looks up the full node/edge object from the `DfdGraph` it already has (not from re-parsing XML attributes) and renders it in a new panel, using `LabShell`'s existing `selection` state that has been wired end-to-end but never populated since the old renderer was deleted.

**Tech Stack:** TypeScript, React, the existing `frontend/features/dfd-editor/` postMessage protocol layer.

## Global Constraints

- The bridge script sends only enough to *identify* the selected cell (`kind`, `id`) — not a reconstructed node/edge object. `DfdEditorFrame.tsx` looks the full object up from the `graph` prop it already holds (guaranteed schema-valid), never trusts a client-side reconstruction of a `DfdNode`/`DfdEdge` from raw XML attributes.
- Boundaries, multi-select, and cells with no `dfdKind` all resolve to `null` selection — no panel, matches the existing `DfdSelection` type (node/edge/null only).
- The vendored `frontend/public/drawio/index.html` gets exactly one line touched (the new `<script>` tag). The bridge script itself lives outside the vendored tree, in a new sibling directory, matching the existing `frontend/public/drawio-shapes/` precedent.
- No automated test can cover the bridge script's actual runtime behavior (it only runs inside the real draw.io iframe against the real mxGraph runtime) — live-browser verification is required before this ships, not optional.

---

## File structure

**New:**
- `frontend/public/drawio-selection-bridge/dfd-selection-bridge.js` — the bridge script.
- `frontend/features/labs/NodeDetailsPanel.tsx` — the details panel component.

**Modified:**
- `frontend/public/drawio/index.html` — one `<script>` tag added.
- `frontend/public/drawio/VENDORED.md` — note the one deliberate edit.
- `frontend/features/dfd-editor/drawio-protocol.ts` — new `DrawioEvent` variant.
- `frontend/features/dfd-editor/drawio-protocol.test.ts` — tests for it.
- `frontend/features/dfd-editor/DfdEditorFrame.tsx` — real selection handler.
- `frontend/features/labs/LabShell.tsx` — render `NodeDetailsPanel`.

---

### Task 1: Bridge script + vendored `index.html` edit

**Files:**
- Create: `frontend/public/drawio-selection-bridge/dfd-selection-bridge.js`
- Modify: `frontend/public/drawio/index.html`
- Modify: `frontend/public/drawio/VENDORED.md`

**Interfaces:**
- Produces: a `postMessage({ event: "dfd-selection", kind: "node" | "edge" | null, id: string | null }, "*")` sent to `window.parent` whenever the real draw.io selection changes.

- [ ] **Step 1: Write the bridge script**

```javascript
// frontend/public/drawio-selection-bridge/dfd-selection-bridge.js
//
// Same-origin bridge into the real draw.io editor's selection API. The
// embed's own postMessage protocol has no "selection changed" event (see
// docs/superpowers/specs/2026-08-11-dfd-node-selection-design.md for the
// grep evidence), but because we self-host /drawio/index.html at our own
// origin, this script — loaded from inside that same page, before draw.io's
// own bundle — can intercept the real EditorUi construction and tap
// mxGraph's actual internal selection model directly.
//
// window.EditorUi is assigned once, by draw.io's own bundle, as a plain
// `var EditorUi = function(...) {...}`. Defining a getter/setter on it
// BEFORE that assignment happens lets us wrap the constructor function the
// instant it's set, so `new EditorUi(...)` (called by draw.io's own
// bootstrap) runs through our wrapper and hands us `this` — the live
// instance — right as it's constructed. Patching AFTER the page loads is
// too late: draw.io constructs and fully initializes EditorUi synchronously
// within one script evaluation, before any polling loop gets a turn.
(function () {
  var realEditorUi;
  Object.defineProperty(window, "EditorUi", {
    configurable: true,
    get: function () {
      return realEditorUi;
    },
    set: function (fn) {
      function WrappedEditorUi() {
        var result = fn.apply(this, arguments);
        onEditorUiReady(this);
        return result;
      }
      WrappedEditorUi.prototype = fn.prototype;
      Object.setPrototypeOf(WrappedEditorUi, fn);
      realEditorUi = WrappedEditorUi;
    },
  });

  function onEditorUiReady(ui) {
    var graph = ui.editor && ui.editor.graph;
    if (!graph || !graph.getSelectionModel) return;

    graph.getSelectionModel().addListener(window.mxEvent.CHANGE, function () {
      var cells = graph.getSelectionCells();
      var payload = { event: "dfd-selection", kind: null, id: null };

      if (cells.length === 1) {
        var cell = cells[0];
        // Our compiler wraps every node/edge/boundary in an <object
        // dfdKind="...">, which mxGraph parses so the object element
        // itself becomes the cell's value — cell.getAttribute reads its
        // attributes directly, the same way draw.io's own Edit Data
        // dialog does. A freehand cell (drawn from the shape library, not
        // our compiler) has no dfdKind and falls through to the null case.
        var kind = cell.getAttribute ? cell.getAttribute("dfdKind", null) : null;
        if (kind === "node" || kind === "edge") {
          payload.kind = kind;
          payload.id = cell.id;
        }
      }

      window.parent.postMessage(JSON.stringify(payload), "*");
    });
  }
})();
```

- [ ] **Step 2: Wire it into `index.html`**

Find the vendored bundle's own script tag in `frontend/public/drawio/index.html` (search for `app.min.js` or the main bundle reference — it's near the end of `<body>`). Add the bridge script tag immediately before it:

```html
<script src="/drawio-selection-bridge/dfd-selection-bridge.js"></script>
```

Confirm placement by viewing the surrounding lines — the bridge script MUST load and execute before the vendored bundle assigns `window.EditorUi`, so it has to appear earlier in document order than that script tag.

- [ ] **Step 3: Document the edit**

Append to `frontend/public/drawio/VENDORED.md`:

```markdown

## Deliberate edits to vendored files

`index.html` has one added line: a `<script>` tag loading
`/drawio-selection-bridge/dfd-selection-bridge.js` (our own file, not
vendored) before the main bundle's own script tag. This installs a
same-origin selection-tracking bridge — see
docs/superpowers/specs/2026-08-11-dfd-node-selection-design.md. If you
re-vendor this directory from a newer draw.io release, re-add this one line
to the new `index.html`.
```

- [ ] **Step 4: Verify the file loads without breaking anything**

Run: `cd frontend && pnpm exec vitest run` (confirm no regressions — this task touches no TypeScript, so this is just a sanity check that nothing else broke).

Manual spot-check (can be folded into Task 4's fuller verification, but do a quick version now): with the dev server running, open `http://localhost:3000/drawio/index.html` directly in a browser, open devtools console, confirm no script errors, and confirm `typeof window.EditorUi` reports `"function"` (the wrapped constructor, not undefined).

- [ ] **Step 5: Commit**

```bash
git add frontend/public/drawio-selection-bridge frontend/public/drawio/index.html frontend/public/drawio/VENDORED.md
git commit -m "Add same-origin bridge script for real draw.io selection events"
```

---

### Task 2: Protocol event + `DfdEditorFrame` wiring

**Files:**
- Modify: `frontend/features/dfd-editor/drawio-protocol.ts`
- Modify: `frontend/features/dfd-editor/drawio-protocol.test.ts`
- Modify: `frontend/features/dfd-editor/DfdEditorFrame.tsx`

**Interfaces:**
- Consumes: the bridge script's `{ event: "dfd-selection", kind, id }` payload (Task 1).
- Produces: `DfdEditorFrame`'s `onSelectionChange` prop is called with a real `DfdSelection` value (looked up from `graph`), replacing the current always-`null` dead branch.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/features/dfd-editor/drawio-protocol.test.ts — add to the parseDrawioMessage describe block
it("parses a dfd-selection event", () => {
  const raw = JSON.stringify({ event: "dfd-selection", kind: "node", id: "n1" });
  expect(parseDrawioMessage(raw)).toEqual({ event: "dfd-selection", kind: "node", id: "n1" });
});

it("parses a dfd-selection event with no selection", () => {
  const raw = JSON.stringify({ event: "dfd-selection", kind: null, id: null });
  expect(parseDrawioMessage(raw)).toEqual({ event: "dfd-selection", kind: null, id: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm exec vitest run drawio-protocol.test.ts`
Expected: FAIL — these two specific assertions pass through `parseDrawioMessage` fine already (it's generic), so this step is really about confirming the *type* compiles once you add it in Step 3; if the tests already pass because `parseDrawioMessage` doesn't care about the `event` value, that's fine — proceed to Step 3 for the type addition and Step 4 for `DfdEditorFrame`'s real behavior, which is the part that actually needs new code.

- [ ] **Step 3: Add the type**

In `frontend/features/dfd-editor/drawio-protocol.ts`, add to the `DrawioEvent` union:

```typescript
export type DrawioEvent =
  | { event: "init" }
  | { event: "save"; xml: string }
  | { event: "autosave"; xml: string }
  | { event: "select"; cells?: { id: string }[] }
  | { event: "dfd-selection"; kind: "node" | "edge" | null; id: string | null }
  | { event: "exit" };
```

(Leave the existing unused `"select"` variant in place — it's still accurate documentation of what the *public* draw.io embed protocol nominally has, even though this vendored build never emits it; `dfd-selection` is our own addition, clearly distinguished by name.)

- [ ] **Step 4: Update `DfdEditorFrame.tsx`**

Replace the dead `data.event === "select"` branch:

```typescript
      } else if (data.event === "dfd-selection") {
        onSelectionChange(resolveSelection(data, graph));
      }
```

Add a small helper above the component (or in the same file):

```typescript
function resolveSelection(
  data: { kind: "node" | "edge" | null; id: string | null },
  graph: DfdGraph,
): DfdSelection {
  if (data.kind === "node" && data.id) {
    const node = graph.nodes.find((n) => n.id === data.id);
    return node ? { kind: "node", node } : null;
  }
  if (data.kind === "edge" && data.id) {
    const edge = graph.edges.find((e) => e.id === data.id);
    return edge ? { kind: "edge", edge } : null;
  }
  return null;
}
```

- [ ] **Step 5: Run tests, typecheck**

Run: `cd frontend && pnpm exec vitest run drawio-protocol.test.ts && pnpm exec tsc --noEmit -p . && pnpm exec vitest run`
Expected: all pass, clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add frontend/features/dfd-editor
git commit -m "Wire real draw.io selection events into DfdEditorFrame"
```

---

### Task 3: Details panel + `LabShell` wiring

**Files:**
- Create: `frontend/features/labs/NodeDetailsPanel.tsx`
- Modify: `frontend/features/labs/LabShell.tsx`

**Interfaces:**
- Consumes: `DfdSelection` from `@curated-labs/shared`; `LabShell`'s existing `selection` state (already populated once Task 2 lands).
- Produces: `<NodeDetailsPanel selection={DfdSelection} />` — renders nothing when `selection` is `null`.

- [ ] **Step 1: Write the component**

```tsx
// frontend/features/labs/NodeDetailsPanel.tsx
"use client";

import type { DfdSelection } from "@curated-labs/shared";
import { tokens } from "@/lib/tokens";
import { Card } from "@/components/ui";

/** Shows what's currently selected in the DFD — separate from RefPicker
 *  (which turns a selection into an attached answer reference on specific
 *  steps); this is a general "what is this" box available on every step. */
export function NodeDetailsPanel({ selection }: { selection: DfdSelection }) {
  if (!selection) return null;

  const title = selection.kind === "node" ? selection.node.label : selection.edge.label || selection.edge.id;
  const subtitle = selection.kind === "node" ? selection.node.type.replace(/_/g, " ") : "data flow";

  return (
    <Card>
      <div style={{ fontSize: tokens.size.xs, textTransform: "uppercase", letterSpacing: 1, color: tokens.color.textFaint }}>
        {subtitle}
      </div>
      <h3 style={{ margin: `${tokens.space(1)} 0 ${tokens.space(2)}`, fontSize: tokens.size.lg }}>{title}</h3>
      {selection.kind === "node" ? (
        <>
          {selection.node.description && (
            <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: 0 }}>{selection.node.description}</p>
          )}
          {selection.node.assets.length > 0 && (
            <div style={{ marginTop: tokens.space(2), display: "flex", gap: tokens.space(1), flexWrap: "wrap" }}>
              {selection.node.assets.map((asset) => (
                <span
                  key={asset}
                  style={{
                    fontSize: tokens.size.xs,
                    padding: `${tokens.space(1)} ${tokens.space(2)}`,
                    background: tokens.color.surfaceSunken,
                    borderRadius: tokens.radius.sm,
                    color: tokens.color.textMuted,
                  }}
                >
                  {asset}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {selection.edge.protocol && (
            <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: 0 }}>{selection.edge.protocol}</p>
          )}
          {selection.edge.data.length > 0 && (
            <div style={{ marginTop: tokens.space(2), display: "flex", gap: tokens.space(1), flexWrap: "wrap" }}>
              {selection.edge.data.map((d) => (
                <span
                  key={d}
                  style={{
                    fontSize: tokens.size.xs,
                    padding: `${tokens.space(1)} ${tokens.space(2)}`,
                    background: tokens.color.surfaceSunken,
                    borderRadius: tokens.radius.sm,
                    color: tokens.color.textMuted,
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
```

Before writing this, check `frontend/components/ui` for the exact `Card` export signature and `frontend/lib/tokens.ts` for `bgSubtle`/`radius.sm` — if either doesn't exist under those exact names, use whatever the real equivalents are (grep `tokens.color.bg` and `tokens.radius` usages elsewhere in `frontend/features/labs/` for the real token names before assuming).

- [ ] **Step 2: Render it in `LabShell.tsx`**

Find the right-column `<div>` in `LabShell.tsx` (the one currently rendering `{error && ...}`, `{body}`, `<FeedbackPanel .../>`, `{Roadmap...}` — search for `FeedbackPanel` to locate it). Add `NodeDetailsPanel` there, positioned right after the diagram-adjacent content makes sense (above `{body}` so it's visible regardless of which step is active):

```tsx
import { NodeDetailsPanel } from "./NodeDetailsPanel";

// ...inside the right column's JSX, before `{body}`:
<NodeDetailsPanel selection={selection} />
```

- [ ] **Step 3: Verify**

Run: `cd frontend && pnpm exec tsc --noEmit -p . && pnpm exec vitest run`
Expected: clean typecheck, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/features/labs/NodeDetailsPanel.tsx frontend/features/labs/LabShell.tsx
git commit -m "Add NodeDetailsPanel and wire it into LabShell"
```

---

### Task 4: Live-browser verification

**Files:** none (verification only).

- [ ] **Step 1: Full automated suite**

```bash
pnpm -r typecheck
pnpm -r test
```

- [ ] **Step 2: Manual/browser verification**

Start both dev servers, dev-login, then:
1. Open a curated lab (view-only mode). Click a node — confirm the panel shows its label, type, description, assets. Click an edge — confirm protocol/data show. Click empty canvas — confirm the panel disappears.
2. Confirm draw.io's own native selection highlight still appears in the canvas (no custom work needed for this, just confirm nothing broke it).
3. Generate a Custom Playground scenario, open its review page (edit mode). Repeat the click/details checks.
4. On the architecture-issues or threats step (of either a curated lab or playground scenario), confirm `RefPicker`'s "Attach ..." button reappears when a node is selected (it was hidden specifically because `selection` was always `null` — this should come back to life with no additional code, confirming the fix reaches that dormant consumer too).
5. Zero console errors throughout.

- [ ] **Step 3: Report results, no commit needed for this task**
