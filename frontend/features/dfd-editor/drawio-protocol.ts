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

/** `chrome=0`, not `chromeless=1`/`edit=0`, is what actually gates read-only
 *  in the vendored v31.1.8 build (frontend/public/drawio/js/app.min.js):
 *  `new Editor("0"==urlParams.chrome || ..., null, null, null, "0"!=urlParams.chrome)`
 *  derives both `chromeless` and `editable` from the single `chrome` param,
 *  and `chromeless && !editable` is what flips `graph.isEnabled` to `false`
 *  (real interaction lockout, not just hidden toolbar). `urlParams.chromeless`
 *  itself has zero read sites in that bundle — it's a documented flag from
 *  draw.io's public embed docs that this vendored release doesn't wire up.
 *  Verified by grepping the vendored bundle directly per this task's note to
 *  confirm flags against the actual asset before trusting the public docs. */
export function embedUrl(mode: "view" | "edit"): string {
  const params = new URLSearchParams({
    embed: "1",
    proto: "json",
    spin: "1",
    libraries: "1",
    ...(mode === "view" ? { chrome: "0" } : {}),
  });
  return `/drawio/index.html?${params.toString()}`;
}
