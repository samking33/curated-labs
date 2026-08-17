import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const XML_PATH = path.join(import.meta.dirname, "../../public/drawio-shapes/dfd-shapes.xml");

/**
 * Regression test for a real bug found in Task 13's manual verification
 * pass: the file originally embedded each shape's mxGraphModel XML as a raw,
 * unescaped string directly inside <mxlibrary>'s text content. That's
 * invalid XML: a real browser's parser (which the vendored draw.io build
 * uses to load this file) hits the first literal "<" inside the embedded
 * "<mxGraphModel>" and treats it as real markup, failing with a
 * <parsererror>. draw.io's own loader silently swallows that failure: the
 * result is a library that "loads" (no console error, no failed network
 * request) but is completely absent from the editor's sidebar. Wrapping the
 * JSON payload in <![CDATA[ ]]> exempts it from XML parsing, fixing this.
 * No jsdom/DOMParser here (the frontend package doesn't depend on jsdom):
 * these checks target the exact string-level property that broke: no
 * unescaped "<" outside the CDATA section.
 */
describe("dfd-shapes.xml (custom draw.io shape library)", () => {
  const raw = readFileSync(XML_PATH, "utf8");

  it("wraps the JSON payload in a CDATA section", () => {
    expect(raw).toMatch(/<mxlibrary[^>]*><!\[CDATA\[[\s\S]*\]\]><\/mxlibrary>/);
  });

  it("has no unescaped '<' outside the CDATA section (only the mxlibrary open/close tags)", () => {
    const withoutCdata = raw.replace(/<!\[CDATA\[[\s\S]*?\]\]>/, "");
    const angleBracketCount = (withoutCdata.match(/</g) ?? []).length;
    expect(angleBracketCount).toBe(2); // <mxlibrary ...> and </mxlibrary>
  });

  it("has a title so the sidebar shows a readable library name, not the raw filename", () => {
    expect(raw).toMatch(/<mxlibrary[^>]*\btitle="DFD Shapes"/);
  });

  it("the CDATA payload is valid JSON with all 7 DFD node types + trust boundary", () => {
    const match = raw.match(/<!\[CDATA\[([\s\S]*)\]\]>/);
    expect(match).not.toBeNull();
    const entries = JSON.parse(match![1]) as { title: string; xml: string }[];
    expect(entries.map((e) => e.title)).toEqual([
      "External Entity",
      "Process",
      "Service",
      "Data Store",
      "Queue",
      "Third Party",
      "Trust Boundary",
    ]);
    // Each entry's embedded "xml" field is itself a full mxGraphModel doc:
    // sanity-check the structure round-tripped intact through JSON escaping.
    for (const entry of entries) {
      expect(entry.xml).toContain("<mxGraphModel>");
      expect(entry.xml).toContain("</mxGraphModel>");
    }
  });
});
