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

  it("parses a dfd-selection event from the same-origin bridge script", () => {
    expect(parseDrawioMessage(JSON.stringify({ event: "dfd-selection", kind: "node", id: "customer" }))).toEqual({
      event: "dfd-selection",
      kind: "node",
      id: "customer",
    });
  });

  it("parses a dfd-selection event with no selection", () => {
    expect(parseDrawioMessage(JSON.stringify({ event: "dfd-selection", kind: null, id: null }))).toEqual({
      event: "dfd-selection",
      kind: null,
      id: null,
    });
  });
});

describe("loadAction", () => {
  it("builds a load action carrying the compiled XML", () => {
    expect(loadAction("<mxGraphModel/>")).toEqual({ action: "load", xml: "<mxGraphModel/>", autosave: 1 });
  });
});

describe("embedUrl", () => {
  // chrome=0, not chromeless=1/edit=0, is what the vendored v31.1.8 build
  // actually reads to lock the graph read-only: see the comment on
  // embedUrl() for the grep evidence from the vendored bundle.
  it("adds chrome=0 for view mode", () => {
    const url = embedUrl("view");
    expect(url).toContain("chrome=0");
  });

  it("omits the chrome flag for edit mode", () => {
    const url = embedUrl("edit");
    expect(url).not.toContain("chrome=");
  });

  // addEmbedButtons (grepped from app.min.js) gates its floating Save/Exit
  // buttons on embed=1 alone, not on chromeless: present in both modes
  // unless explicitly suppressed. This app never uses them.
  it("suppresses the floating Save/Exit embed buttons in both modes", () => {
    expect(embedUrl("view")).toContain("noSaveBtn=1");
    expect(embedUrl("view")).toContain("noExitBtn=1");
    expect(embedUrl("edit")).toContain("noSaveBtn=1");
    expect(embedUrl("edit")).toContain("noExitBtn=1");
  });

  // clibs=U<url> is how the vendored build's App.prototype.restoreLibraries
  // auto-opens a URL-backed custom shape library at startup (see the
  // comment on embedUrl() for the grep evidence). Only needed in edit mode
  //: restoreLibraries is a no-op without a sidebar, which view mode lacks.
  // The URL must be absolute (the caller's origin): a relative path fails
  // the vendored build's isCorsEnabledForUrl check and gets routed through
  // a proxy servlet this static deployment doesn't have (see the comment
  // on embedUrl() for how that was confirmed live against a real 404).
  it("points clibs at an absolute DFD shape library URL for edit mode", () => {
    const url = embedUrl("edit", "http://localhost:3000");
    expect(url).toContain(`clibs=U${encodeURIComponent("http://localhost:3000/drawio-shapes/dfd-shapes.xml")}`);
  });

  it("omits clibs for view mode even when an origin is passed", () => {
    const url = embedUrl("view", "http://localhost:3000");
    expect(url).not.toContain("clibs=");
  });

  it("adds libs= for a single provider present in the graph", () => {
    const url = embedUrl("edit", "http://localhost:3000", ["aws"]);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("libs")).toBe("aws4");
  });

  // Note: a plain `.not.toContain("libs=")` would be a false negative here
  //: "clibs=" (always present in edit mode) contains "libs=" as a
  // substring: so this parses the query string instead of substring-
  // matching it.
  it("omits libs= when no provider is present", () => {
    const url = embedUrl("edit", "http://localhost:3000", []);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.has("libs")).toBe(false);
  });

  it("still loads clibs= (our custom DFD shapes) alongside libs=", () => {
    const url = embedUrl("edit", "http://localhost:3000", ["aws"]);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("clibs")).toContain("dfd-shapes.xml");
    expect(params.get("libs")).toBe("aws4");
  });

  // GCP has no queue/pub-sub icon in the gcp3 stencil library: the gcp2
  // library's embedded-image style covers that type instead (see the
  // findings doc's style-strings table). Both must load together so the
  // sidebar's GCP section covers all 4 infra node types.
  //
  // Note: checked via URLSearchParams rather than `toContain("libs=gcp3;gcp2")`
  //. URLSearchParams percent-encodes `;` as `%3B` in the raw query string
  // (the findings doc confirms the vendored app's single decodeURIComponent
  // pass before `.split(";")` handles that fine at runtime), so a literal
  // `;` substring check on the raw URL would never match.
  it("adds both gcp3 and gcp2 for the gcp provider", () => {
    const url = embedUrl("edit", "http://localhost:3000", ["gcp"]);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("libs")).toBe("gcp3;gcp2");
  });
});
