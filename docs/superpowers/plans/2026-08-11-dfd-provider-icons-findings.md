# DFD provider icons — verified style strings and libs= format

Verified against the vendored jgraph/drawio v31.1.8 build
(frontend/public/drawio/), live in a real browser (Playwright/Chromium), per Task 2 of
docs/superpowers/plans/2026-08-11-dfd-provider-icons.md.

## Methodology

1. Served `frontend/public` (not just `frontend/public/drawio`) via
   `python3 -m http.server 8899` from `frontend/public`, so both
   `/drawio/index.html` (the vendored standalone editor) and
   `/drawio-shapes/dfd-shapes.xml` (this repo's custom DFD shape library) are
   reachable from the same origin — this mirrors how the app actually serves
   them and was required for the `libs=` + `clibs=` coexistence test.
2. Opened `http://localhost:8899/drawio/index.html` (full standalone UI, not
   `embed=1`) with Playwright/Chromium (installed on demand via `npm install
   playwright` in a scratch directory + `npx playwright install chromium`;
   the browser was not preinstalled in this environment).
3. For each provider × type: typed a search term into the sidebar's "Type /
   to search" box, read back the resulting `a.geItem` drag-source elements'
   screen coordinates, and simulated a real drag (`mouse.down` → `mouse.move`
   steps → `mouse.up`) from the search result onto the canvas — clicking a
   sidebar item does not insert it in this build, only a real drag does.
4. Selected the newly-placed shape and opened **Edit → Edit Style...**
   (`Cmd+E`), then read the style dialog's `<textarea>` value directly from
   the DOM. Note: the dialog's first `<textarea>` in the DOM is a decoy
   (`class="mxTypingShim"`, always empty) used for IME input handling — the
   real style text is in the *second* `<textarea>`. Reading the first one
   silently returns an empty string with no error, which is exactly the kind
   of "looks like a small script bug, actually a wrong-value trap" this task
   was warned about; caught by comparing against a manual screenshot of the
   dialog before trusting the automated extraction.
5. Where a candidate name from the brief's table wasn't the cleanest single
   shape (e.g. searching "ec2" surfaces AWS ECS/container icons before the
   plain EC2 instance; searching "azure" for "Virtual Machine" surfaces
   AWS's "VMware Cloud on AWS" before Azure's own icon), searched more
   specific terms (e.g. "Amazon EC2", "azure virtual machine") and used the
   `shape=`/`resIcon=`/`image=` value visible in the captured style itself
   to positively identify the right vendor/resource before accepting it —
   not just the thumbnail's appearance.
6. After collecting all 12, placed them all on one canvas in a grid and
   screenshotted the result to visually confirm every one renders as a real,
   non-blank icon (not just that a style string was captured) —
   `scratchpad/pw/07-all-12-rendered.png` in this run's temp dir shows all 12
   rendering correctly, including the two GCP icons whose thumbnails are
   easy to mistake for broken/empty (Cloud Functions renders as a small
   `(...)` bracket glyph — that IS Google's actual Cloud Functions mark, not
   a placeholder; Pub/Sub renders as a small blue dotted node graph).
7. For `libs=`, grepped `frontend/public/drawio/js/app.min.js` directly
   (`urlParams.libs`, `libAliases`, and the `{id:"aws4",...}` /
   `{id:"azure2",...}` / `{id:"mscae",...}` configuration entries) rather
   than relying on public draw.io docs, then confirmed live by loading the
   standalone editor with `libs=aws4` (single) and `libs=aws4;gcp2`
   (multiple) combined with a real `clibs=` value and screenshotting the
   sidebar to confirm both the built-in provider palette(s) *and* the custom
   `DFD Shapes` library appear simultaneously, expanded.

## Deviations from the brief's suggested candidate names

- **AWS `process`**: used `Amazon EC2` (→ `resIcon=mxgraph.aws4.ec2`)
  instead of bare `ec2`/`lambda` — searching literal `ec2` ranks AWS
  ECS/container and Alibaba Cloud ECS results above the actual EC2 icon.
- **AWS `queue`**: brief suggested searching for "simple queue service" or
  "sqs"; used `Amazon Simple Queue Service`, which resolves cleanly and
  uniquely to `resIcon=mxgraph.aws4.sqs`.
- **Azure (all four types)**: the brief's candidates (`Storage Blob`, `SQL
  Database`, `Virtual Machine`, `Queue Generic`) come from the *older*
  `stencils/azure.xml` set (`shape=mxgraph.azure.*`). Live search in this
  build surfaces the *newer* `azure2` library first for these terms —
  simple `image;...;image=img/lib/azure2/<category>/<Name>.svg;` styles
  referencing the vendored SVG assets directly (confirmed those files exist
  on disk under `frontend/public/drawio/img/lib/azure2/`). These are the
  official current Microsoft Azure icon set draw.io ships, are simpler
  single-image shapes than the old stencil paths, and are what the app's
  own search ranks first — used these instead per the brief's "adjust if a
  cleaner/more standard icon is found" allowance. (The old
  `mxgraph.azure.storage_queue` stencil shape does still exist and is still
  searchable — confirmed it surfaces for "Storage Queue" — but was not used,
  for consistency with the other three Azure picks.)
- **GCP `process` / `data_store` / `service`**: used the newer `gcp3`
  stencil library (`shape=mxgraph.gcp3.computeengine`,
  `shape=mxgraph.gcp3.cloudsql`, `shape=mxgraph.gcp3.cloudrun`) instead of
  `gcp2`, because `gcp3` renders as a plain named `shape=` reference
  (consistent with the AWS4 pattern) rather than an embedded base64 SVG.
  **Correction from an earlier draft of this doc**: `gcp3` is not a small
  library — grepping `gcp3\.[a-zA-Z_]+` in `app.min.js` finds 46 named
  shapes (`computeengine`, `cloudsql`, `cloudrun`, `serverlesscomputing`,
  `gke`, `bigquery`, `apigee`, `alloydb`, ... — a full modern icon set), not
  "a handful". A code-review pass caught this and asked for a live
  re-check specifically for a `service`-shaped candidate; searching "Cloud
  Run" and "Serverless Computing" live in the editor and reading their
  captured styles via Edit Style confirmed both exist as clean
  `shape=mxgraph.gcp3.<name>` stencils
  (`sketch=0;html=1;...;shape=mxgraph.gcp3.cloudrun;fillColor=#4285f4` and
  `...;shape=mxgraph.gcp3.serverlesscomputing;fillColor=#9aa0a6`
  respectively — both screenshotted rendering as real, non-blank icons at
  `scratchpad/pw2/candidates-full.png` in this run's temp dir). `cloudrun`
  was chosen over `serverlesscomputing` for the `service` row: it's a
  distinct, official, immediately-recognizable Google product mark (a
  three-color chevron/play glyph, confirmed at 4x zoom in
  `scratchpad/pw2/cloudrun-zoom.png`), it uses `fillColor=#4285f4` — the
  same GCP blue as the `computeengine` and `cloudsql` picks already used
  for `process`/`data_store`, keeping all three GCP icons visually
  consistent — and semantically "Cloud Run" (a managed serverless
  container/service platform) is a more literal match for a generic
  "service" DFD node than "Serverless Computing", which renders as a
  generic gray (`fillColor=#9aa0a6`, an odd color one out next to the blue
  process/data_store icons) cloud-with-refresh-arrows glyph that isn't tied
  to a specific recognizable product.
- **GCP `queue`**: `gcp3`'s 46 shapes (re-confirmed above) still don't
  include a Pub/Sub or generic queue/messaging/topic icon — re-grepped
  `gcp3\.[a-zA-Z_]+` output for `pubsub|queue|messag|topic|event` and found
  no match. So `queue` still falls back to the `gcp2` library's image-shape
  style (`shape=image;...;image=data:image/svg+xml,<base64>;`) — this is
  how *all* gcp2 icons are expressed in this bundle (embedded data URIs,
  not file paths like azure2 or named stencils like aws4/gcp3), confirmed
  by inspecting several other gcp2 search results during investigation.
- All four AWS picks and all three `gcp3` picks (`process`, `data_store`,
  `service`) are simple single-part icons. Azure and the one remaining
  `gcp2` pick (`queue` / Pub/Sub) are also single-part `image` shapes, just
  with different underlying image encodings (file path vs. embedded data
  URI) — none of the 12 are multi-part/grouped diagrams.

## Style strings

| provider | type | style |
|---|---|---|
| aws | process | `sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#ED7100;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;` |
| aws | service | `sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#ED7100;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;` |
| aws | data_store | `sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#C925D1;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;` |
| aws | queue | `sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#E7157B;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs;` |
| azure | process | `image;aspect=fixed;html=1;points=[];align=center;fontSize=12;image=img/lib/azure2/compute/Virtual_Machine.svg;` |
| azure | service | `image;aspect=fixed;html=1;points=[];align=center;fontSize=12;image=img/lib/azure2/compute/Function_Apps.svg;` |
| azure | data_store | `image;aspect=fixed;html=1;points=[];align=center;fontSize=12;image=img/lib/azure2/databases/SQL_Database.svg;` |
| azure | queue | `image;aspect=fixed;html=1;points=[];align=center;fontSize=12;image=img/lib/azure2/general/Storage_Queue.svg;` |
| gcp | process | `sketch=0;html=1;verticalAlign=top;labelPosition=center;verticalLabelPosition=bottom;align=center;fontSize=11;fontStyle=0;fontColor=#000000;aspect=fixed;pointerEvents=1;shape=mxgraph.gcp3.computeengine;fillColor=#4285f4` |
| gcp | service | `sketch=0;html=1;verticalAlign=top;labelPosition=center;verticalLabelPosition=bottom;align=center;fontSize=11;fontStyle=0;fontColor=#000000;aspect=fixed;pointerEvents=1;shape=mxgraph.gcp3.cloudrun;fillColor=#4285f4` |
| gcp | data_store | `sketch=0;html=1;verticalAlign=top;labelPosition=center;verticalLabelPosition=bottom;align=center;fontSize=11;fontStyle=0;fontColor=#000000;aspect=fixed;pointerEvents=1;shape=mxgraph.gcp3.cloudsql;fillColor=#4285f4` |
| gcp | queue | `editableCssRules=.*;html=1;shape=image;verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;aspect=fixed;imageAspect=0;image=data:image/svg+xml,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnY9Imh0dHBzOi8vdmVjdGEuaW8vbmFubyIgd2lkdGg9IjE4LjMxOTk5OTY5NDgyNDIyIiBoZWlnaHQ9IjIwLjAwMDAwMTkwNzM0ODYzMyIgdmlld0JveD0iMCAwIDE4LjMxOTk5OTY5NDgyNDIyIDIwLjAwMDAwMTkwNzM0ODYzMyI+JiN4YTsJPHN0eWxlIHR5cGU9InRleHQvY3NzIj4mI3hhOwkuc3Qwe2ZpbGw6IzY2OWRmNjt9JiN4YTsJLnN0MXtmaWxsOiM0Mjg1ZjQ7fSYjeGE7CS5zdDJ7ZmlsbDojYWVjYmZhO30mI3hhOwk8L3N0eWxlPiYjeGE7CTxkZWZzPiYjeGE7CQk8ZmlsdGVyIGlkPSJBIiB4PSI0LjY0IiB5PSI0LjE5IiB3aWR0aD0iMTQuNzMiIGhlaWdodD0iMTIuNzYiIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj4mI3hhOwkJCTxmZUZsb29kIGZsb29kLWNvbG9yPSIjZmZmIi8+JiN4YTsJCQk8ZmVCbGVuZCBpbj0iU291cmNlR3JhcGhpYyIvPiYjeGE7CQk8L2ZpbHRlcj4mI3hhOwkJPG1hc2sgaWQ9IkIiIHg9IjQuNjQiIHk9IjQuMTkiIHdpZHRoPSIxNC43MyIgaGVpZ2h0PSIxMi43NiIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSI+JiN4YTsJCQk8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyLjIzIiByPSIzLjU4IiBmaWx0ZXI9InVybCgjQSkiLz4mI3hhOwkJPC9tYXNrPiYjeGE7CTwvZGVmcz4mI3hhOwk8ZyBjbGFzcz0ic3QwIj4mI3hhOwkJPGNpcmNsZSBjeD0iMTYuMTMiIGN5PSI2LjIxIiByPSIxLjcyIi8+JiN4YTsJCTxjaXJjbGUgY3g9IjIuMTkiIGN5PSI2LjIxIiByPSIxLjcyIi8+JiN4YTsJCTxjaXJjbGUgY3g9IjkuMTYiIGN5PSIxOC4yOCIgcj0iMS43MiIvPiYjeGE7CTwvZz4mI3hhOwk8ZyBtYXNrPSJ1cmwoI0IpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMi44NCAtMikiPiYjeGE7CQk8cGF0aCB0cmFuc2Zvcm09Im1hdHJpeCguNSAtLjg3IC44NyAuNSAtNC41OSAyMC41MykiIGQ9Ik0xNC42OSAxMC4yMmgxLjU5djguMDRoLTEuNTl6IiBjbGFzcz0ic3QxIi8+JiN4YTsJCTxwYXRoIHRyYW5zZm9ybT0icm90YXRlKDMzMCA4LjUyMyAxNC4yNDQpIiBkPSJNNC40OSAxMy40NWg4LjA0djEuNTlINC40OXoiIGNsYXNzPSJzdDEiLz4mI3hhOwkJPHBhdGggZD0iTTExLjIgNC4xOWgxLjU5djguMDRIMTEuMnoiIGNsYXNzPSJzdDEiLz4mI3hhOwk8L2c+JiN4YTsJPGcgY2xhc3M9InN0MiI+JiN4YTsJCTxjaXJjbGUgY3g9IjkuMTYiIGN5PSIxMC4yMyIgcj0iMi43OCIvPiYjeGE7CQk8Y2lyY2xlIGN4PSIyLjE5IiBjeT0iMTQuMjUiIHI9IjIuMTkiLz4mI3hhOwkJPGNpcmNsZSBjeD0iMTYuMTMiIGN5PSIxNC4yNSIgcj0iMi4xOSIvPiYjeGE7CQk8Y2lyY2xlIGN4PSI5LjE2IiBjeT0iMi4xOSIgcj0iMi4xOSIvPiYjeGE7CTwvZz4mI3hhOzwvc3ZnPg==;` |

All 12 were placed on a live canvas simultaneously and visually confirmed to
render as real, non-blank icons (screenshot taken during verification, not
committed — it's throwaway scratch output).

Note the three `gcp3` styles (`process`, `data_store`, `service`) end
without a trailing `;` — that's exactly what the live Edit Style dialog
showed, not a transcription artifact of this doc.

## libs= format

Grepped `frontend/public/drawio/js/app.min.js` (`Sidebar.prototype.showEntries`):

```
k=!1,null!=urlParams.libs&&0<urlParams.libs.length&&(p.push(decodeURIComponent(urlParams.libs)),k=...)
...
l=p.join(";").split(";");p={};for(k=0;k<l.length;k++)p[this.libAliases[l[k]]||l[k]]=!0;
for(k=0;k<this.configuration.length;k++)"search"!=this.configuration[k].id&&
  this.showPalettes(...,1==p[this.configuration[k].id]);
```

- `urlParams.libs` is `decodeURIComponent`'d **once**, then split on **`;`**
  — so it's a single query param whose value is a `;`-separated list of
  library keys (same shape as `clibs=`, but without the `U`/type-tag prefix
  `clibs=` entries use — `libs=` entries are always bare keys, not URLs).
- Each split key is looked up in `Sidebar.prototype.libAliases =
  {aws2:"aws3", gcp:"gcp2"}` (aliases map old/short names to the current
  library id) and then matched against `this.configuration[k].id` to decide
  which built-in sidebar palette section to force open. The `aws4`, `azure`,
  `azure2`, `gcp2`, `gcp3`, `mscae`, etc. entries all exist directly as
  `{id:"aws4",...}` / `{id:"azure2",...}` / `{id:"gcp3",...}` — confirmed by
  grepping the `configuration` array literal in `app.min.js`.
- **Single library**: `libs=aws4` — confirmed live: expands the "AWS /
  ..." category tree in the sidebar (screenshot
  `scratchpad/pw/08-libs-clibs.png` in this run's temp dir).
- **Multiple libraries**: semicolon-separated within the one param, e.g.
  `libs=aws4;gcp2` — confirmed live: both the "AWS / ..." and the GCP
  category trees expand simultaneously (screenshot
  `scratchpad/pw/09-multi-libs.png`).
- No extra `decodeURIComponent`-safe encoding is needed beyond what
  `URLSearchParams`/a normal query string already provides — a literal `;`
  in the raw query string works as-is (confirmed live), and would also
  survive being percent-encoded as `%3B` since `decodeURIComponent` runs
  once before the `.split(";")`.
- This differs from `clibs=`, whose entries are type-tagged
  (`U<url>` for a URL-backed library) — `libs=` entries are always plain
  registered library ids, never URLs. The two params are read independently
  (`App.prototype.restoreLibraries` for `clibs`,
  `Sidebar.prototype.showEntries` for `libs`) and are not related to each
  other beyond both being consulted at startup.

## Confirmed: libs= and clibs= coexist

**Yes.** Tested live against the standalone editor served from
`frontend/public` (so `/drawio/index.html` and `/drawio-shapes/dfd-shapes.xml`
share an origin, matching the real app's layout):

```
http://localhost:8899/drawio/index.html?libs=aws4&clibs=Uhttp%3A%2F%2Flocalhost%3A8899%2Fdrawio-shapes%2Fdfd-shapes.xml
```

Result: the sidebar showed **both** the custom `DFD Shapes` library (all 7
of this repo's DFD shapes: External Entity, Process, Service, Data Store,
Queue, Third Party, Trust Boundary) **and** the built-in `AWS / ...`
category tree (Arrows, General Resources, Illustrations, Groups, Analytics,
Application Integration, AR & VR, Artificial Intelligence, Blockchain,
Business Applications, Cloud Financial Management, Compute, ... — the full
AWS4 sidebar) expanded at the same time. Also tested the multi-library form
combined with `clibs=`:

```
http://localhost:8899/drawio/index.html?libs=aws4;gcp2&clibs=Uhttp%3A%2F%2Flocalhost%3A8899%2Fdrawio-shapes%2Fdfd-shapes.xml
```

Result: `AWS / ...`, `GCP / ...`, and `DFD Shapes` all present simultaneously.
