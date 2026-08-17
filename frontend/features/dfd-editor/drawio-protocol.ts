/** draw.io embed postMessage event shapes (proto=json). Stable across
 *  releases: see https://www.drawio.com/doc/faq/embed-mode (or the
 *  vendored client's own bundled docs) for the authoritative reference. */
export type DrawioEvent =
  | { event: "init" }
  | { event: "save"; xml: string }
  | { event: "autosave"; xml: string }
  | { event: "select"; cells?: { id: string }[] }
  | { event: "exit" }
  /** Emitted by our own same-origin bridge script
   *  (frontend/public/drawio-selection-bridge/dfd-selection-bridge.js), not
   *  the vendored draw.io embed itself: the embed's own postMessage
   *  protocol has no selection-change event. `kind`/`id` are the raw
   *  dfdKind/id attributes read off the selected mxGraph cell; null for no
   *  selection, multi-select, or a cell with no dfdKind (trust boundary,
   *  freehand shape). */
  | { event: "dfd-selection"; kind: "node" | "edge" | null; id: string | null }
  /** Escape pressed while focus was inside the editor: also from our own
   *  bridge, so the parent can close a full-screen view the iframe has
   *  keyboard focus in. */
  | { event: "dfd-escape" };

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

/** `chrome=0`, not `chromeless=1`/`edit=0`, is what actually gates read-only
 *  in the vendored v31.1.8 build (frontend/public/drawio/js/app.min.js):
 *  `new Editor("0"==urlParams.chrome || ..., null, null, null, "0"!=urlParams.chrome)`
 *  derives both `chromeless` and `editable` from the single `chrome` param,
 *  and `chromeless && !editable` is what flips `graph.isEnabled` to `false`
 *  (real interaction lockout, not just hidden toolbar). `urlParams.chromeless`
 *  itself has zero read sites in that bundle: it's a documented flag from
 *  draw.io's public embed docs that this vendored release doesn't wire up.
 *  Verified by grepping the vendored bundle directly per this task's note to
 *  confirm flags against the actual asset before trusting the public docs.
 *
 *  How the vendored build restores a custom shape library at startup
 *  (grepped the same way): `App.prototype.start` calls `restoreLibraries()`
 *  unconditionally, which reads `urlParams.clibs` (a `;`-separated list)
 *  and passes it to `loadLibraries`. Each entry's first character is a type
 *  tag, `"U"` for a URL-backed `UrlLibrary`, and the rest is
 *  `decodeURIComponent`'d once to get the library file's URL. `urlParams`
 *  itself is parsed from the raw, undecoded query string (bootstrap.js), so
 *  the value must NOT be pre-encoded here: `URLSearchParams` supplies the
 *  single encoding pass the app's own `decodeURIComponent` expects to undo.
 *  `restoreLibraries` bails out when `this.sidebar` is null, which is only
 *  the case in chromeless (view) mode, so this is edit-mode only, matching
 *  Task 8's dfd-shapes.xml, which only matters when dragging shapes onto an
 *  editable canvas.
 *
 *  The URL itself must be absolute, not a same-origin-relative path:
 *  `loadTemplate()` (also grepped from app.min.js) only fetches a library
 *  URL directly when `isCorsEnabledForUrl(url)` is true, and that check is
 *  `url.substring(0, location.origin.length) == location.origin`: a plain
 *  string-prefix match against the *full* origin, which a relative path
 *  like `/drawio-shapes/dfd-shapes.xml` never satisfies. Failing that check
 *  routes the fetch through `PROXY_URL + "?url=..."`, a backend proxy
 *  servlet this static-file deployment doesn't have (confirmed live: a
 *  relative URL here 404s on `/drawio/proxy?url=...`). Passing the
 *  caller's `window.location.origin` avoids the proxy path entirely. */
const DFD_SHAPE_LIBRARY_URL = "/drawio-shapes/dfd-shapes.xml";

/** Maps our coarse `provider` values to the vendored build's built-in
 *  sidebar library keys (`urlParams.libs`, `;`-separated, matched against
 *  `Sidebar.prototype.configuration[k].id`: see the findings doc's
 *  `libs=` section for the grep evidence). Live-verified real values, not
 *  guesses: `azure` resolves to the newer `azure2` library (not the older
 *  `azure` stencil set the plan first guessed). `gcp` needs BOTH `gcp3`
 *  (process/data_store/service: the modern named-stencil library) AND
 *  `gcp2` (queue: gcp3 has no Pub/Sub/queue icon, confirmed by grepping
 *  its 46 stencil names for pubsub/queue/messag/topic/event and finding
 *  none), so a single provider can map to more than one library key. */
const PROVIDER_LIBRARY_KEY: Record<"aws" | "azure" | "gcp", string[]> = {
  aws: ["aws4"],
  azure: ["azure2"],
  gcp: ["gcp3", "gcp2"],
};

/** `addEmbedButtons` (grepped from app.min.js) gates its floating "Save"/
 *  "Exit" buttons on `embed=1` alone, not on `chromeless`: they'd render
 *  over the canvas in BOTH modes otherwise. This app never uses them: view
 *  mode has nothing to save, and the app's own onSave callback + page chrome
 *  (e.g. "Back to catalog") already cover save/exit. `urlParams.noSaveBtn`
 *  and `urlParams.noExitBtn` are real, confirmed-present gates in the
 *  vendored bundle (grepped directly, not assumed from public docs). */
export function embedUrl(mode: "view" | "edit", origin = "", providers: ("aws" | "azure" | "gcp")[] = []): string {
  const params = new URLSearchParams({
    embed: "1",
    proto: "json",
    spin: "1",
    libraries: "1",
    noSaveBtn: "1",
    noExitBtn: "1",
    ...(mode === "view" ? { chrome: "0" } : { clibs: `U${origin}${DFD_SHAPE_LIBRARY_URL}` }),
  });
  if (mode === "edit" && providers.length > 0) {
    const keys = [...new Set(providers.flatMap((p) => PROVIDER_LIBRARY_KEY[p]))];
    params.set("libs", keys.join(";"));
  }
  return `/drawio/index.html?${params.toString()}`;
}
