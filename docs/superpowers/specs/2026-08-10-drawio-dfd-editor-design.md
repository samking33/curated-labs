# draw.io DFD editor — design

Status: approved (brainstorming), not yet planned/implemented.

## Problem

DFDs (data flow diagrams) are currently rendered by a custom React canvas
(`frontend/features/dfd/*`) driven entirely by our own structured JSON
(`dfdGraphSchema` in `shared/`). There is no interactive DFD editor anywhere
in the platform today — curated lab DFDs are hand-authored as static JSON
seed files, and the Custom Playground review step (just shipped) only lets a
learner *view* an AI-generated DFD before starting the workflow, not edit it.

We want a real DFD editor, and we want it to be draw.io (self-hosted, open
source `jgraph/drawio`) rather than building/extending our own canvas —
across the whole platform: curated lab authoring, curated lab viewing during
a workflow, and the Custom Playground generate → review/edit step.

## Decision: draw.io XML is the persisted source of truth

Every DFD is stored exactly once, as draw.io (mxGraph) XML. Our structured
`DfdGraph` JSON (used by AI generation prompts, grading, and referential
validation) is never persisted — it is always derived fresh from the XML at
read time via a pure extractor function. This makes drift between "what's
drawn" and "what the AI/grader sees" structurally impossible: there is only
one stored copy, and the JSON view of it is recomputed every time, not
cached and hand-maintained separately.

Two alternatives were considered and rejected:

- **draw.io is just a rendering skin over our existing JSON, JSON stays
  authoritative.** Rejected because it doesn't actually deliver "fully use
  draw.io" — editing a diagram would mean maintaining a bespoke JSON↔canvas
  sync layer instead of trusting draw.io's own file format, and any editor
  feature draw.io supports natively (routing, styling, groups) that our JSON
  schema doesn't model would be silently lossy.
- **AI and curators author draw.io XML directly, no JSON layer at all.**
  Rejected because our own benchmark (see prior session) already showed
  models struggling to produce *valid JSON* for a full scenario generation
  (one candidate model returned unparseable output, one timed out). Raw
  mxGraph XML is a harder, less-constrained target, and every downstream
  consumer (`validateSeedReferences`, `validateGeneratedScenario`, all 5 AI
  coaching prompts, grading) would need a new XML-aware code path instead of
  the JSON path they already have and trust.

The chosen design keeps AI generation and grading exactly as they are today
(operating on `DfdGraph` JSON) and adds a deterministic compile/extract layer
between that JSON and the persisted XML.

## Architecture

### New components

- **Self-hosted draw.io editor.** Build the open-source `jgraph/drawio` web
  client (static JS/HTML/CSS — no server-side language of its own) and vendor
  the built bundle ourselves. No new runtime service or backend language is
  introduced; this is a build-time step, served as static assets from our
  existing infra. Embedded via `<iframe>` + the `postMessage` embed protocol
  draw.io already supports (`load`, `save`, `autosave`, `export` events).

- **Custom draw.io shape library.** A stencil set for our 7 DFD node types
  (`external_entity`, `process`, `data_store`, `service`, `queue`,
  `third_party`, `trust_boundary`) plus edge styling matching our current
  visual language (dashed for `third_party`, trust-boundary-crossing
  styling). Start from the `drawio-threatmodeling` stencils (MIT-licensed,
  evaluated in the prior session) rather than hand-drawing icons from
  scratch; adjust to match our existing glyphs where it matters.

- **`shared/src/dfd-xml.ts`** — two pure, isomorphic (frontend + backend)
  functions:
  - `compileToDrawioXml(graph: DfdGraph): string` — deterministic,
    template-based JSON→XML. No parsing library needed for this direction;
    the output structure is fixed and fully under our control. Node/edge ids
    from `DfdGraph` are stamped directly as draw.io cell ids (stable across
    edits, since draw.io preserves ids of cells it didn't create). Our
    semantic fields that draw.io has no native concept of — `type`,
    `description`, `assets` — are stamped onto each cell as a draw.io
    UserObject ("Edit Data") custom attribute, not inferred from shape
    style, so they survive round-trips regardless of how the shape is
    reskinned.
  - `extractFromDrawioXml(xml: string): DfdGraph` — parses arbitrary
    (possibly hand-edited) XML using a small real parser (e.g.
    `fast-xml-parser` — pure JS, no DOM dependency, works identically in
    Node and the browser), reads back the UserObject attributes plus
    mxCell geometry/parent relationships (for trust-boundary containment)
    and edge source/target, and validates the result with the *existing*
    `dfdGraphSchema.parse()` — same schema, unchanged.

- **`DfdEditorFrame.tsx`** (new) — replaces `DfdViewer.tsx` as the single
  integration point in `LabShell.tsx` (currently the only consumer of the
  DFD viewer). Thin wrapper around the iframe + postMessage protocol,
  supporting two modes:
  - **Edit mode** — curated lab authoring, Custom Playground review/edit
    step.
  - **View-only mode** — learner viewing a curated lab's DFD during a
    workflow step. Pure display, loaded from `drawioXml`, no extraction
    needed on this path at all.

### Deleted

The entire custom DFD renderer: `DfdCanvas.tsx`, `DfdNode.tsx`,
`DfdEdge.tsx`, `DfdBoundary.tsx`, `DfdInspector.tsx`, `layout.ts`,
`themes.ts` (8 files total, including `DfdViewer.tsx` itself). Confirmed via
grep that `DfdViewer`/`DfdCanvas` are consumed only from `LabShell.tsx`, so
this is a single-point swap, not a scattered rewrite.

### Unchanged

- `dfdGraphSchema` and the rest of `shared/src/schemas/dfd.ts` — untouched.
  It is still exactly what `extractFromDrawioXml()` produces and what AI
  prompts/grading consume; it just stops being what's persisted.
- AI generation (`AUTHOR_PROMPTS`, `buildGeneratorUserPrompt`,
  `generateScenario`) — unchanged. Still generates structured `DfdGraph`
  JSON as part of the full scenario draft, exactly as shipped.
- `validateSeedReferences` / `validateGeneratedScenario` — unchanged logic,
  just re-triggered against the *extracted* graph on every save (see below)
  instead of only once at generation time.
- All 5 AI coaching prompts and grading logic in `attempts.service.ts` /
  `common/workflow.ts` — unchanged; node `type` was confirmed (via grep) to
  be purely a rendering concern today, never read by AI prompts or grading,
  so nothing downstream needs to change to accommodate the new storage
  model.

## Storage model

One rule, applied consistently everywhere a DFD is stored:

| Location | Before | After |
|---|---|---|
| `LabDfd` (curated labs) | `graphJson: Json` | `drawioXml: String` |
| `PlaygroundGeneratedScenario` | `contentJson.dfd` embedded in the JSON blob | `dfd` field dropped from the content schema; new sibling column `dfdXml: String` |

Wherever the full structured object is needed (AI prompts, grading, the
review UI), it is assembled at read time by merging
`extractFromDrawioXml(dfdXml)` into the rest of the already-stored data.
Nothing hand-maintains a second copy of the graph as JSON.

## Data flow

**Curated lab authoring:** curator builds/edits the DFD in the embedded
editor (edit mode). On publish, `extractFromDrawioXml()` runs once purely to
validate (referential integrity + bounds) — the extracted JSON itself is
never stored, only used to gate the publish action.

**Custom Playground generation:** AI generates structured `DfdGraph` JSON
exactly as today (unchanged, already benchmarked/validated) →
`compileToDrawioXml()` converts it to the initial XML → that XML is what's
persisted (`dfdXml`) and what the learner's review/edit step opens in the
embedded editor (edit mode). If the learner edits the diagram, the accept
action re-runs `extractFromDrawioXml()` + the existing referential-integrity
validator before the edit is accepted.

**Learner viewing (curated lab workflow steps):** `DfdEditorFrame` in
view-only mode, loaded directly from `drawioXml`. No extraction happens on
this path — pure display.

## Editing UX & error handling

- **Autosave** — the embedded editor autosaves a draft via debounced
  `postMessage` "autosave" events to a draft-only backend endpoint, so
  in-progress edits survive a reload. No validation gate on autosave.
- **Accept/Publish is the validation gate** — this is where
  `extractFromDrawioXml()` + referential-integrity validation actually run.
  On failure, the same kind of error list `validateGeneratedScenario`
  already produces today (e.g. "threat X has no mitigation mapping",
  "unknown node reference") is surfaced next to the editor, and the
  accept/publish action is blocked until the user fixes it in draw.io. This
  reuses an existing error-list rendering pattern, not a new UI paradigm.
- **`compileToDrawioXml()` throws on an AI-generated graph** — should not
  happen, since it only ever runs against an already-Zod-validated
  `DfdGraph`. If it does, treat it as a generation failure and route into
  the existing one-repair-attempt retry flow, not a new error path.
- **`extractFromDrawioXml()` produces something that fails
  `dfdGraphSchema.parse()` outright** (malformed XML, not just a
  referential-integrity gap) — generic "couldn't read this diagram" error,
  block accept, offer to reset to the last good version.
- **Self-hosted editor bundle fails to load** — same-origin static asset, so
  in practice this is a "did the build ship correctly" problem rather than a
  live third-party dependency risk. Still needs a basic iframe-load-timeout
  fallback state in `DfdEditorFrame`.

## Migration

One-time script runs `compileToDrawioXml()` over all 9 existing curated lab
seed files' `graphJson`, producing the initial `drawioXml` values. A Prisma
migration then adds `drawioXml` / drops `graphJson` on `LabDfd`, and adds
`dfdXml` to `PlaygroundGeneratedScenario` (no existing rows there yet — the
Custom Playground feature just shipped this session, so there is no
`PlaygroundGeneratedScenario` data to migrate). Same discipline as the
Playground migrations run earlier this session: generate with
`--create-only`, read the SQL before applying, apply with `migrate deploy`
(no prompts, no seed). No live user data is at risk — this project is
pre-production.

## Testing

- **Round-trip unit tests** for `compileToDrawioXml` → `extractFromDrawioXml`
  — should be the identity function on a `DfdGraph`, fixture-tested against
  all 9 curated seed graphs plus at least one AI-generated playground
  scenario shape.
- **Regression tests** confirming referential-integrity errors (unknown node
  reference, threat with no mitigation mapping, duplicate keys) are still
  caught after a round trip through XML — same assertions
  `validateSeedReferences`/`validateGeneratedScenario` already have, just
  proven to survive the new compile/extract hop.
- **Manual/screenshot verification** of the embedded editor: load, edit,
  save (draft autosave + accept/publish gate), and view-only mode — same
  verification approach used for the Custom Playground feature.

## Open items for the implementation plan (not decided here)

- Exact hosting path for the self-hosted draw.io static bundle (Next.js
  public route vs. a dedicated static route/CDN) — an implementation detail,
  not an architecture decision.
- Whether the `drawio-threatmodeling` stencils are used as-is or restyled to
  more closely match the current glyph set — a visual-polish call to make
  during implementation, not blocking the design.
