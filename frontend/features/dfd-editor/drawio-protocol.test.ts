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
  // chrome=0, not chromeless=1/edit=0, is what the vendored v31.1.8 build
  // actually reads to lock the graph read-only — see the comment on
  // embedUrl() for the grep evidence from the vendored bundle.
  it("adds chrome=0 for view mode", () => {
    const url = embedUrl("view");
    expect(url).toContain("chrome=0");
  });

  it("omits the chrome flag for edit mode", () => {
    const url = embedUrl("edit");
    expect(url).not.toContain("chrome=");
  });
});
