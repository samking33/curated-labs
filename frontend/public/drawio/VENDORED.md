Vendored from jgraph/drawio v31.1.8 (draw.war, WEB-INF/META-INF stripped).
To update: repeat the download/unzip steps in the DFD editor implementation
plan (docs/superpowers/plans/2026-08-10-drawio-dfd-editor.md, Task 8) with a
newer tag.

## Deliberate edits to vendored files

`index.html` has one added line: a `<script>` tag loading
`/drawio-selection-bridge/dfd-selection-bridge.js` (our own file, not
vendored) before `js/main.js`. This installs a same-origin selection-tracking
bridge — see docs/superpowers/specs/2026-08-11-dfd-node-selection-design.md.
If you re-vendor this directory from a newer draw.io release, re-add this
one line to the new `index.html`.
