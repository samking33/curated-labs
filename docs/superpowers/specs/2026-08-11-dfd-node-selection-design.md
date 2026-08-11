# DFD node/edge selection + details panel — design

Status: approved (brainstorming), not yet planned/implemented.

## Problem

The embedded draw.io editor (shipped in an earlier plan) shows selection
highlighting natively inside its own canvas when you click a shape — that
part needs no work. But nothing on our page reacts to it: `LabShell.tsx`
has a `selection` state and a `setSelection` setter left over from the old
(deleted) custom renderer, but `DfdEditorFrame.tsx`'s `onSelectionChange`
handler is permanently dead — it only fires in response to a `select`
postMessage event, and the vendored draw.io embed never actually emits one
(confirmed by grepping the full event list in `app.min.js`: `init, ready,
save, autosave, exit, export, configure, prompt, template, draft, merge,
patch, getDiff, resetDiff, openLink, resize, scrollWheel, shortcut,
textContent, remoteInvoke*` — no `select`). This was flagged and
deliberately left unfixed at the end of the prior plan (the dead control
that referenced it was hidden rather than faked).

We want: clicking a node or edge in the diagram shows its details (type,
label, description, assets for a node; label, protocol, data for an edge)
in a panel on our page, in both view-only mode (curated labs) and edit mode
(Custom Playground review step).

## Decision: a same-origin bridge script, not a workaround

Because we self-host `/drawio/index.html` at our own origin (not a
different domain), the embedded iframe is same-origin with our app — not
subject to the cross-origin restrictions that make `postMessage` the *only*
communication channel in most iframe integrations. This was verified live,
not assumed:

- `window.EditorUi` is a real global constructor in the vendored bundle,
  but the running *instance* isn't stored anywhere directly reachable
  (checked `window.App.main` — it's the bootstrap function, not the
  instance; walked all of `window`'s own properties looking for an object
  with `.editor.graph.getSelectionModel` — none found).
- Patching `EditorUi.prototype.init` after the page loads doesn't work
  either — draw.io constructs and fully initializes its `EditorUi` instance
  synchronously within one script evaluation, before any `setTimeout`-based
  polling gets a chance to run.
- Intercepting the *assignment* of `window.EditorUi` itself via
  `Object.defineProperty` (a getter/setter that wraps whatever constructor
  function the vendored bundle assigns, before it's ever called) does work
  — verified live: the wrapped constructor captures `this` the instant
  draw.io calls `new EditorUi(...)`, and from there
  `capturedInstance.editor.graph.getSelectionModel()` is a real, working
  mxGraph selection model. Registering a real
  `addListener(mxEvent.CHANGE, ...)` on it and simulating a selection fired
  the listener correctly with the actual selected cell(s).

This is the real fix, not a workaround: it uses draw.io's actual internal
selection API (the same one its own UI uses), not a poll-based
approximation or a guess at some future embed-protocol feature.

## Architecture

- **`frontend/public/drawio-selection-bridge/dfd-selection-bridge.js`**
  (new, small, authored by us — sibling to `frontend/public/drawio/` the
  same way `frontend/public/drawio-shapes/` already is, not inside the
  vendored tree). On load: installs the `Object.defineProperty`
  interception on `window.EditorUi`, waits for the real instance to be
  captured, then registers a selection-change listener on
  `graph.getSelectionModel()`. On every change:
  - Reads `graph.getSelectionCells()`.
  - If exactly one cell is selected and it carries a `dfdKind` of `"node"`
    or `"edge"` (read via the cell's `<object>`-wrapped value, the same
    `dfdType`/`dfdDescription`/`dfdAssets`/`dfdProtocol`/`dfdData`
    attributes `compileToDrawioXml` already stamps), builds a plain object
    with that data.
  - Otherwise (nothing selected, multiple cells selected, a trust boundary,
    or a freehand cell with no `dfdKind`) sends `null`.
  - `window.parent.postMessage(JSON.stringify({ event: "dfd-selection",
    node: ... }), "*")`.
- **`frontend/public/drawio/index.html`** (vendored, one deliberate edit):
  a single
  `<script src="/drawio-selection-bridge/dfd-selection-bridge.js"></script>`
  tag added before the vendored bundle's own script tag, so the
  `Object.defineProperty` hook is installed before `EditorUi` is ever
  assigned. This is the only line touched inside the vendored tree itself.
  Documented in the existing `VENDORED.md` note, so a future re-vendor
  doesn't silently drop it.
- **`frontend/features/dfd-editor/drawio-protocol.ts`**: `DrawioEvent`
  gains a `{ event: "dfd-selection"; node: RawSelection | null }` variant.
  `parseDrawioMessage` needs no change (already generic).
- **`frontend/features/dfd-editor/DfdEditorFrame.tsx`**: the existing dead
  `data.event === "select"` branch is replaced with a real
  `data.event === "dfd-selection"` handler that calls the existing
  `onSelectionChange` prop with the real `DfdSelection` value (built from
  the bridge's raw node/edge data) instead of always `null`.
- **`frontend/features/labs/NodeDetailsPanel.tsx`** (new): renders
  `selection` (the `DfdSelection` value `LabShell.tsx` already tracks) —
  type/label/description/assets for a node, label/protocol/data for an
  edge, nothing when `selection` is `null`.
- **`frontend/features/labs/LabShell.tsx`**: renders `NodeDetailsPanel` in
  the existing right column. No new state — `selection`/`setSelection`
  already exist and are already passed to `DfdEditorFrame`; they've simply
  never received real data until now.

## Scope

- Works in both view-only mode (curated labs, locked post-attempt) and
  edit mode (Playground pre-attempt review) — the bridge script and
  selection listener don't care which mode the embed is in.
- Nodes and edges both show details (the existing `DfdSelection` type
  already supports both — left over from the old renderer — and the
  bridge script reads the same kind of `<object>` attributes for either).
- Trust boundaries, multi-select, and freehand cells with no `dfdKind` all
  resolve to `null` (no panel) — kept out of scope, matches the existing
  type contract (`DfdSelection` has no boundary variant).
- Hover is NOT specially engineered — draw.io's own canvas already shows a
  lightweight highlight/cursor change on hover natively; only click
  (real selection) drives the details panel. A hover-triggered popup would
  be unusually noisy UX and isn't what most diagram tools do.

## Testing

- Unit tests for the new `DrawioEvent` variant and `DfdEditorFrame`'s
  handler, following the existing `drawio-protocol.test.ts` pattern (pure
  functions, no browser needed for the parsing/dispatch logic itself).
- The bridge script itself (`dfd-selection-bridge.js`) has no automated
  test — it only runs inside the real draw.io iframe and its correctness
  depends on the real mxGraph runtime, matching how the rest of this
  codebase's vendored-bundle-dependent code (`chrome=0`, `clibs=`) has been
  verified: live, in a real browser, not simulated.
- Manual/live-browser verification is required before this ships: load a
  curated lab, click a node, confirm the panel shows correct data; click an
  edge, confirm the same; click empty canvas, confirm the panel clears;
  repeat in a Playground edit-mode scenario. This is not optional coverage
  — it's the only way to confirm the bridge script's runtime behavior
  against the real vendored build, the same lesson learned twice already
  in this codebase.
