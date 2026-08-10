# DFD provider-specific icons (AWS/Azure/GCP) — design

Status: approved (brainstorming), not yet planned/implemented.

## Problem

The DFD editor (shipped in the prior `drawio-dfd-editor` plan) renders every
node using one of 7 generic shapes (`external_entity`, `process`, `service`,
`data_store`, `queue`, `third_party`, `trust_boundary`) regardless of what
the node actually represents. A lab whose DFD is really "an S3 bucket feeding
a Lambda function" today just shows a generic box and a generic circle —
there is no way to show that it's specifically AWS (or Azure, or GCP).

We want infrastructure nodes to optionally render with real cloud-provider
iconography when a lab's content actually involves a named vendor, while
nodes with no vendor stay on the current generic shapes.

## Decision: a coarse `provider` field, not exact per-service icons

`dfdNodeSchema` (shared) gains one new optional field:

```ts
provider?: "aws" | "azure" | "gcp"
```

set only on the 4 infrastructure node types — `process`, `service`,
`data_store`, `queue`. `external_entity`, `third_party`, and
`trust_boundary` are never provider-styled; a person or an outside company
isn't "AWS-flavored" in any meaningful sense.

This is a **coarse** mapping — provider × type picks ONE representative icon
per combination (e.g. "AWS-styled data store", "GCP-styled compute"), not
the exact underlying service (S3 vs. RDS vs. DynamoDB all render as the same
"AWS data store" icon). The alternative — exact service icons, chosen by
name (e.g. "S3 bucket", "Lambda function") — was rejected: AWS's own draw.io
stencil library alone has 1,037 named shapes. Supporting exact-service
selection would need a curated whitelist per provider, real prompt
engineering to get the AI choosing correctly, and strict validation against
that whitelist to reject hallucinated/invalid shape names — a much bigger
project than what's actually needed here. Coarse mapping needs 3 providers ×
4 types = 12 style entries total, is a bounded enum the AI can't get wrong
in a way that produces a broken shape, and still visually reads as
"this is AWS" / "this is GCP" at a glance, which is the actual goal.

## Architecture

- **`shared/src/schemas/dfd.ts`**: `dfdNodeSchema` gains
  `provider: z.enum(["aws", "azure", "gcp"]).optional()`.
- **`shared/src/dfd-xml.ts` (`compileToDrawioXml`)**: a new
  `PROVIDER_STYLE` lookup (`Record<"aws"|"azure"|"gcp", Partial<Record<DfdNodeType, string>>>`,
  populated only for the 4 infra types) is checked before the existing
  `SHAPE_STYLE` map; `SHAPE_STYLE[node.type]` remains the fallback when
  `provider` is unset or the specific provider×type combination has no
  entry. The compiler also stamps a new `dfdProvider="<provider>"` custom
  attribute on the node's `<object>`, alongside the existing `dfdType`, so
  it round-trips.
- **`extractFromDrawioXml`**: reads `dfdProvider` back the same way it
  already reads `dfdType`.
- **draw.io's OWN built-in stencil libraries are reused, not re-authored.**
  The vendored `frontend/public/drawio/stencils/` already ships real AWS4,
  Azure, and GCP2 stencil files (confirmed: `aws4.xml` alone has 1,037 named
  shapes including `lambda`, `rds`, `ec2`, `key management service`; Azure
  has `Storage Blob`, `SQL Database`, `Virtual Machine`; GCP2 has
  `Cloud Storage`, `Cloud Functions`, `Cloud SQL`, `Compute Engine`). No new
  shape-authoring work — this is purely about referencing existing built-in
  stencils correctly.
- **Editor (edit mode only)**: `embedUrl()`/`DfdEditorFrame` gain logic to
  additionally load draw.io's built-in provider library (via `libs=`, the
  mechanism draw.io uses for its own bundled libraries — distinct from the
  `clibs=` mechanism already used for our custom "DFD Shapes" library, which
  loads an external URL) when any node in the current graph already has a
  `provider` set. This surfaces the relevant provider's shape palette
  alongside our own DFD shapes for further edits, without cluttering the
  sidebar with all ~10 built-in cloud libraries when a scenario has no
  cloud vendor at all.
- **View-only mode** (curated labs, and any locked-post-attempt DFD): no
  editor/sidebar concern at all — it's pure rendering. The compiler already
  picks the provider-styled icon at compile time; view mode just displays
  whatever XML was compiled.
- **AI generator (`AUTHOR_PROMPTS`)**: the generator system prompt gains
  guidance that `provider` should be set ONLY when the learner's intake
  explicitly names a specific cloud vendor — never inferred or guessed from
  generic cues like "the cloud" or "serverless." Absence of a named vendor
  means every node stays providerless (current generic rendering).

## Open technical risk — needs live verification before the compiler ships

I found real, valid shape names in the vendored stencil files (e.g.
`lambda`, `rds` in `aws4.xml`), but modern AWS4 shapes in draw.io commonly
render through a two-part style — a base shape
(`shape=mxgraph.aws4.resourceIcon`) plus a `resIcon=mxgraph.aws4.<name>`
style property — rather than a single direct
`shape=mxgraph.aws4.<name>` reference. I have not confirmed the exact
working syntax against *this specific* vendored v31.1.8 build. Guessing
wrong here doesn't error, it silently renders a blank/broken shape — exactly
the class of bug the prior plan's Task 9 and Task 13 caught by grepping the
live bundle and testing in a real browser instead of trusting general
draw.io knowledge. The implementation plan for this feature must include a
live-verification step: open the real vendored editor, drag a resource icon
from the AWS4/Azure/GCP2 default panel onto a canvas, and read its actual
generated `style=` string directly, for all 12 provider×type combinations,
before writing `PROVIDER_STYLE` into the compiler.

## Curated lab retrofit

Of the 9 curated labs, exactly 2 have cloud-flavored content, and neither
currently names a specific vendor (deliberately vendor-neutral as written).
Per the brainstorming decision, each gets a different vendor for curriculum
variety:

- **Serverless Data Lake → AWS.** `ingest`/`curated` (both `data_store`) get
  `provider: "aws"`; `transform` (`process`) and `query` (`service`) get
  `provider: "aws"`. `app` (external_entity), `analyst` (external_entity),
  and `partner` (third_party) stay providerless.
- **Multi-Tenant SaaS on Kubernetes → GCP.** `pods` (`service`),
  `secrets`/`db` (both `data_store`), and `ci` (`process`) get
  `provider: "gcp"`. `client` (external_entity), `ingress` (`process` — note:
  deliberately left providerless despite being a `process` type, since an
  ingress controller is a Kubernetes-native concept that exists identically
  on every cloud, not something GCP-specific), and `registry` (third_party)
  stay providerless.

The other 7 curated labs are untouched — no cloud content to retrofit.

## Testing

- Round-trip unit tests for the new `provider` field, following the exact
  pattern of the existing dangling-edge / orphaned-boundary tests in
  `shared/src/dfd-xml.test.ts`: compile a node with `provider` set, extract
  it back, assert the field survives; compile/extract a node with no
  `provider`, assert it stays `undefined` (no accidental default).
- A regression test asserting `SHAPE_STYLE` (generic) is still used as a
  fallback when `provider` is set but that provider has no entry for a given
  type (shouldn't happen with the 4-type scoping, but the fallback should be
  provably safe if it ever does).
- Manual/live-browser verification (per the Open Technical Risk section
  above) is required before the 12-entry `PROVIDER_STYLE` map can be
  trusted — this is not optional automated-test coverage, it's the only way
  to know the style strings actually render the intended icon.
