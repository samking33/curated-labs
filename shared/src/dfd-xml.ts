import { XMLParser } from "fast-xml-parser";
import { LAYOUT_GAPS, NODE_H, NODE_W, layoutGraph } from "./dfd-layout";
import type { Layout } from "./dfd-layout";
import { dfdGraphSchema } from "./schemas/dfd";
import type { DfdGraph, DfdNode, DfdNodeProvider, DfdNodeType } from "./schemas/dfd";

/**
 * draw.io mxGraph XML shapes for our 7 node types, per PLAYGROUND_PROJECT.md's
 * DFD notation. Styles for external_entity/process/data_store/trust boundary
 * are copied verbatim (decoded from base64) from the MIT-licensed
 * drawio-threatmodeling library (github.com/michenriksen/drawio-threatmodeling)
 * so the diagram matches an established DFD visual convention rather than one
 * we invented. service/queue/third_party have no direct match in that library
 * and reuse the closest shape with a distinguishing tweak.
 */
const SHAPE_STYLE: Record<DfdNodeType, string> = {
  external_entity: "rounded=0;whiteSpace=wrap;html=1;",
  process: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;",
  service: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;",
  data_store: "shape=partialRectangle;whiteSpace=wrap;html=1;left=0;right=0;fillColor=none;",
  queue: "shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;",
  third_party: "rounded=0;whiteSpace=wrap;html=1;dashed=1;",
  trust_boundary:
    "html=1;fontColor=#FF3333;fontStyle=1;align=left;verticalAlign=top;spacing=0;labelBorderColor=none;" +
    "fillColor=none;dashed=1;strokeWidth=2;strokeColor=#FF3333;spacingLeft=4;spacingTop=-3;",
};

/**
 * Coarse cloud-provider icon styling, scoped to the 4 infrastructure node
 * types (process/service/data_store/queue) — external_entity, third_party,
 * and trust_boundary never get a provider style. One representative style
 * per provider×type combination (12 total), not per-exact-service icons —
 * S3 vs. RDS vs. DynamoDB all render identically as "AWS data store". Every
 * style string below was verified live against the real vendored v31.1.8
 * build (docs/superpowers/plans/2026-08-11-dfd-provider-icons-findings.md),
 * not guessed from general draw.io knowledge — a wrong style string doesn't
 * error, it silently renders a blank shape.
 */
const PROVIDER_STYLE: Partial<Record<DfdNodeProvider, Partial<Record<DfdNodeType, string>>>> = {
  aws: {
    process:
      "sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#ED7100;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;",
    service:
      "sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#ED7100;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;",
    data_store:
      "sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#C925D1;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;",
    queue:
      "sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;fillColor=#E7157B;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs;",
  },
  azure: {
    process: "image;aspect=fixed;html=1;points=[];align=center;fontSize=12;image=img/lib/azure2/compute/Virtual_Machine.svg;",
    service: "image;aspect=fixed;html=1;points=[];align=center;fontSize=12;image=img/lib/azure2/compute/Function_Apps.svg;",
    data_store: "image;aspect=fixed;html=1;points=[];align=center;fontSize=12;image=img/lib/azure2/databases/SQL_Database.svg;",
    queue: "image;aspect=fixed;html=1;points=[];align=center;fontSize=12;image=img/lib/azure2/general/Storage_Queue.svg;",
  },
  gcp: {
    process:
      "sketch=0;html=1;verticalAlign=top;labelPosition=center;verticalLabelPosition=bottom;align=center;fontSize=11;fontStyle=0;fontColor=#000000;aspect=fixed;pointerEvents=1;shape=mxgraph.gcp3.computeengine;fillColor=#4285f4",
    service:
      "sketch=0;html=1;verticalAlign=top;labelPosition=center;verticalLabelPosition=bottom;align=center;fontSize=11;fontStyle=0;fontColor=#000000;aspect=fixed;pointerEvents=1;shape=mxgraph.gcp3.cloudrun;fillColor=#4285f4",
    data_store:
      "sketch=0;html=1;verticalAlign=top;labelPosition=center;verticalLabelPosition=bottom;align=center;fontSize=11;fontStyle=0;fontColor=#000000;aspect=fixed;pointerEvents=1;shape=mxgraph.gcp3.cloudsql;fillColor=#4285f4",
    queue:
      "editableCssRules=.*;html=1;shape=image;verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;aspect=fixed;imageAspect=0;image=data:image/svg+xml,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnY9Imh0dHBzOi8vdmVjdGEuaW8vbmFubyIgd2lkdGg9IjE4LjMxOTk5OTY5NDgyNDIyIiBoZWlnaHQ9IjIwLjAwMDAwMTkwNzM0ODYzMyIgdmlld0JveD0iMCAwIDE4LjMxOTk5OTY5NDgyNDIyIDIwLjAwMDAwMTkwNzM0ODYzMyI+JiN4YTsJPHN0eWxlIHR5cGU9InRleHQvY3NzIj4mI3hhOwkuc3Qwe2ZpbGw6IzY2OWRmNjt9JiN4YTsJLnN0MXtmaWxsOiM0Mjg1ZjQ7fSYjeGE7CS5zdDJ7ZmlsbDojYWVjYmZhO30mI3hhOwk8L3N0eWxlPiYjeGE7CTxkZWZzPiYjeGE7CQk8ZmlsdGVyIGlkPSJBIiB4PSI0LjY0IiB5PSI0LjE5IiB3aWR0aD0iMTQuNzMiIGhlaWdodD0iMTIuNzYiIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj4mI3hhOwkJCTxmZUZsb29kIGZsb29kLWNvbG9yPSIjZmZmIi8+JiN4YTsJCQk8ZmVCbGVuZCBpbj0iU291cmNlR3JhcGhpYyIvPiYjeGE7CQk8L2ZpbHRlcj4mI3hhOwkJPG1hc2sgaWQ9IkIiIHg9IjQuNjQiIHk9IjQuMTkiIHdpZHRoPSIxNC43MyIgaGVpZ2h0PSIxMi43NiIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSI+JiN4YTsJCQk8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyLjIzIiByPSIzLjU4IiBmaWx0ZXI9InVybCgjQSkiLz4mI3hhOwkJPC9tYXNrPiYjeGE7CTwvZGVmcz4mI3hhOwk8ZyBjbGFzcz0ic3QwIj4mI3hhOwkJPGNpcmNsZSBjeD0iMTYuMTMiIGN5PSI2LjIxIiByPSIxLjcyIi8+JiN4YTsJCTxjaXJjbGUgY3g9IjIuMTkiIGN5PSI2LjIxIiByPSIxLjcyIi8+JiN4YTsJCTxjaXJjbGUgY3g9IjkuMTYiIGN5PSIxOC4yOCIgcj0iMS43MiIvPiYjeGE7CTwvZz4mI3hhOwk8ZyBtYXNrPSJ1cmwoI0IpIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMi44NCAtMikiPiYjeGE7CQk8cGF0aCB0cmFuc2Zvcm09Im1hdHJpeCguNSAtLjg3IC44NyAuNSAtNC41OSAyMC41MykiIGQ9Ik0xNC42OSAxMC4yMmgxLjU5djguMDRoLTEuNTl6IiBjbGFzcz0ic3QxIi8+JiN4YTsJCTxwYXRoIHRyYW5zZm9ybT0icm90YXRlKDMzMCA4LjUyMyAxNC4yNDQpIiBkPSJNNC40OSAxMy40NWg4LjA0djEuNTlINC40OXoiIGNsYXNzPSJzdDEiLz4mI3hhOwkJPHBhdGggZD0iTTExLjIgNC4xOWgxLjU5djguMDRIMTEuMnoiIGNsYXNzPSJzdDEiLz4mI3hhOwk8L2c+JiN4YTsJPGcgY2xhc3M9InN0MiI+JiN4YTsJCTxjaXJjbGUgY3g9IjkuMTYiIGN5PSIxMC4yMyIgcj0iMi43OCIvPiYjeGE7CQk8Y2lyY2xlIGN4PSIyLjE5IiBjeT0iMTQuMjUiIHI9IjIuMTkiLz4mI3hhOwkJPGNpcmNsZSBjeD0iMTYuMTMiIGN5PSIxNC4yNSIgcj0iMi4xOSIvPiYjeGE7CQk8Y2lyY2xlIGN4PSI5LjE2IiBjeT0iMi4xOSIgcj0iMi4xOSIvPiYjeGE7CTwvZz4mI3hhOzwvc3ZnPg==;",
  },
};

/** Only these 4 types are ever provider-styled. */
const PROVIDER_ELIGIBLE_TYPES = new Set<DfdNodeType>(["process", "service", "data_store", "queue"]);

function styleFor(node: DfdNode): string {
  if (node.provider && PROVIDER_ELIGIBLE_TYPES.has(node.type)) {
    const override = PROVIDER_STYLE[node.provider]?.[node.type];
    if (override) return override;
  }
  return SHAPE_STYLE[node.type];
}

const BOUNDARY_STYLE = SHAPE_STYLE.trust_boundary;
const EDGE_STYLE = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;";
const EDGE_CROSSING_STYLE = `${EDGE_STYLE}dashed=1;strokeColor=#FF3333;fontColor=#FF3333;`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Under the plain layered layout, every edge that runs from one column to
 * another shares that pair's horizontal band — a node with several outgoing
 * edges into the same next column stacks their labels (and often their
 * orthogonal paths) directly on top of each other, illegible past 2-3 edges.
 * Groups edges by (source column x, target column x) and fans each group
 * out: a genuine forward edge (source column before target column) gets
 * staggered exit/entry connection points so the path itself separates, and
 * every edge in a shared band also gets a vertical label offset so the text
 * stays readable even where paths still cross (same-column and backward
 * edges, which don't get a safe fixed exit/entry side).
 */
function fanOutEdges(graph: DfdGraph, layout: Layout): Map<string, { connectStyle: string; labelOffsetY: number }> {
  const groups = new Map<string, DfdGraph["edges"]>();
  for (const edge of graph.edges) {
    const s = layout.nodes.get(edge.source);
    const t = layout.nodes.get(edge.target);
    if (!s || !t) continue;
    const key = `${s.x}:${t.x}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(edge);
  }

  const LABEL_SPACING = 22;
  const result = new Map<string, { connectStyle: string; labelOffsetY: number }>();
  for (const group of groups.values()) {
    const n = group.length;
    group.forEach((edge, i) => {
      const s = layout.nodes.get(edge.source)!;
      const t = layout.nodes.get(edge.target)!;
      const forward = s.x < t.x;
      const labelOffsetY = n > 1 ? Math.round((i - (n - 1) / 2) * LABEL_SPACING) : 0;
      const frac = ((i + 1) / (n + 1)).toFixed(2);
      const connectStyle =
        forward && n > 1 ? `exitX=1;exitY=${frac};exitDx=0;exitDy=0;entryX=0;entryY=${frac};entryDx=0;entryDy=0;` : "";
      result.set(edge.id, { connectStyle, labelOffsetY });
    });
  }
  return result;
}

/** JSON → draw.io XML. Deterministic — no AI, no parsing library needed for
 *  this direction since we fully control the output shape. */
export function compileToDrawioXml(graph: DfdGraph): string {
  const layout = layoutGraph(graph, LAYOUT_GAPS);
  const cells: string[] = [];

  const boundaryMembers = new Map<string, DfdNode[]>();
  for (const node of graph.nodes) {
    if (!node.trustBoundary) continue;
    if (!boundaryMembers.has(node.trustBoundary)) boundaryMembers.set(node.trustBoundary, []);
    boundaryMembers.get(node.trustBoundary)!.push(node);
  }

  // Trust boundaries first so document order puts them behind nodes/edges
  // (draw.io z-orders by document order).
  graph.trustBoundaries.forEach((boundary, i) => {
    const members = boundaryMembers.get(boundary.id) ?? [];
    const rects = members.map((n) => layout.nodes.get(n.id)!).filter(Boolean);
    const box = rects.length
      ? {
          x: Math.min(...rects.map((r) => r.x)) - 40,
          y: Math.min(...rects.map((r) => r.y)) - 50,
          w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)) + 80,
          h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)) + 90,
        }
      : { x: 0, y: layout.bounds.maxY + 100 + i * 140, w: 200, h: 100 };
    cells.push(
      `<object id="${escapeXml(boundary.id)}" label="${escapeXml(boundary.label)}" dfdKind="boundary" ` +
        `dfdDescription="${escapeXml(boundary.description)}">` +
        `<mxCell style="${BOUNDARY_STYLE}" vertex="1" connectable="0" parent="1">` +
        `<mxGeometry x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" as="geometry"/>` +
        `</mxCell></object>`,
    );
  });

  for (const node of graph.nodes) {
    const pos = layout.nodes.get(node.id)!;
    const providerApplied = node.provider && PROVIDER_ELIGIBLE_TYPES.has(node.type) && PROVIDER_STYLE[node.provider]?.[node.type];
    cells.push(
      `<object id="${escapeXml(node.id)}" label="${escapeXml(node.label)}" dfdKind="node" dfdType="${node.type}" ` +
        (providerApplied ? `dfdProvider="${node.provider}" ` : "") +
        `dfdDescription="${escapeXml(node.description)}" dfdAssets="${escapeXml(node.assets.map(encodeURIComponent).join(","))}"` +
        (node.trustBoundary ? ` dfdTrustBoundary="${escapeXml(node.trustBoundary)}"` : "") +
        `><mxCell style="${styleFor(node)}" vertex="1" parent="1">` +
        `<mxGeometry x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" as="geometry"/>` +
        `</mxCell></object>`,
    );
  }

  const routing = fanOutEdges(graph, layout);
  for (const edge of graph.edges) {
    const { connectStyle, labelOffsetY } = routing.get(edge.id) ?? { connectStyle: "", labelOffsetY: 0 };
    const baseStyle = edge.trustBoundaryCrossing ? EDGE_CROSSING_STYLE : EDGE_STYLE;
    cells.push(
      `<object id="${escapeXml(edge.id)}" label="${escapeXml(edge.label)}" dfdKind="edge" ` +
        `dfdProtocol="${escapeXml(edge.protocol)}" dfdData="${escapeXml(edge.data.map(encodeURIComponent).join(","))}" ` +
        `dfdTrustBoundaryCrossing="${edge.trustBoundaryCrossing ? "1" : "0"}">` +
        `<mxCell style="${baseStyle}${connectStyle}" edge="1" parent="1" ` +
        `source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}">` +
        (labelOffsetY
          ? `<mxGeometry relative="1" as="geometry"><mxPoint x="0" y="${labelOffsetY}" as="offset"/></mxGeometry>`
          : `<mxGeometry relative="1" as="geometry"/>`) +
        `</mxCell></object>`,
    );
  }

  return (
    `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" ` +
    `fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}</root></mxGraphModel>`
  );
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "object" || name === "mxCell",
});

/** Reverse of SHAPE_STYLE, for cells a user drew freehand (no dfdType
 *  attribute because they came from the shape library, not our compiler).
 *  Order matters — more specific substrings are checked first. */
const STYLE_TO_TYPE: [string, DfdNodeType][] = [
  ["shape=partialRectangle", "data_store"],
  ["shape=process", "queue"],
  ["fillColor=#dae8fc", "service"],
  ["ellipse", "process"],
  ["dashed=1", "third_party"],
  ["rounded=0", "external_entity"],
];

function inferType(style: string): DfdNodeType {
  for (const [needle, type] of STYLE_TO_TYPE) if (style.includes(needle)) return type;
  return "process";
}

function splitList(value: unknown): string[] {
  const s = typeof value === "string" ? value : "";
  return s.length ? s.split(",").filter(Boolean).map(decodeURIComponent) : [];
}

type RawAttrs = Record<string, unknown>;

/**
 * draw.io XML -> DfdGraph. Handles both our own compiled output (`<object
 * dfdKind="...">` wrapping an `<mxCell>`, carrying our semantic attributes)
 * and cells a user drew freehand from the shape library (a bare `<mxCell>`
 * with no wrapper or custom attributes) — those get best-effort defaults.
 * Also handles the real editor's own `<mxfile><diagram><mxGraphModel>`
 * wrapper (confirmed by Task 13's manual verification pass against the live
 * embed's `save` event — it does not send back the bare `<mxGraphModel>` we
 * load in with), not just the bare `<mxGraphModel>` `compileToDrawioXml`
 * emits, so an edit made in the real editor round-trips too.
 * Always re-validates with dfdGraphSchema before returning: a malformed or
 * hand-edited file must fail loudly here, not deep inside a grading loop.
 */
export function extractFromDrawioXml(xml: string): DfdGraph {
  const doc = parser.parse(xml) as {
    mxGraphModel?: { root?: RawAttrs };
    mxfile?: { diagram?: { mxGraphModel?: { root?: RawAttrs } } | { mxGraphModel?: { root?: RawAttrs } }[] };
  };
  const diagram = doc.mxfile?.diagram;
  const firstDiagram = Array.isArray(diagram) ? diagram[0] : diagram;
  const root = doc.mxGraphModel?.root ?? firstDiagram?.mxGraphModel?.root;
  if (!root) throw new Error("Not a valid draw.io diagram: missing mxGraphModel/root.");

  const objects = (root.object as RawAttrs[]) ?? [];
  const allCells = (root.mxCell as RawAttrs[]) ?? [];
  const wrappedCellIds = new Set(
    objects
      .map((o) => {
        const cellField = o.mxCell;
        const cell = Array.isArray(cellField) ? cellField[0] : cellField;
        return (cell as RawAttrs | undefined)?.["@_id"];
      })
      .filter(Boolean),
  );
  const bareCells = allCells.filter(
    (c) => c["@_id"] !== "0" && c["@_id"] !== "1" && !wrappedCellIds.has(c["@_id"]),
  );

  const nodes: Record<string, unknown>[] = [];
  const edges: Record<string, unknown>[] = [];
  const trustBoundaries: Record<string, unknown>[] = [];

  const handle = (attrs: RawAttrs, cell: RawAttrs) => {
    const id = String(attrs["@_id"] ?? cell["@_id"]);
    const label = String(attrs["@_label"] ?? cell["@_value"] ?? "");
    const style = String(cell["@_style"] ?? "");
    const kind = attrs["@_dfdKind"];

    if (kind === "boundary" || (!kind && cell["@_connectable"] === "0")) {
      trustBoundaries.push({ id, label, description: String(attrs["@_dfdDescription"] ?? "") });
      return;
    }
    if (kind === "edge" || cell["@_edge"] === "1") {
      const source = String(cell["@_source"] ?? "");
      const target = String(cell["@_target"] ?? "");
      // The real editor doesn't delete connected edges when a vertex is
      // deleted (plain Delete on a node leaves its edges behind, now missing
      // one endpoint) — drop the dangling edge here rather than pushing a
      // malformed one that fails dfdGraphSchema.parse() below and aborts the
      // whole extraction with a generic "couldn't read that diagram" error.
      // Dropping it instead lets checkDfdReferences (in the PATCH handler)
      // catch the now-missing edge/node id and report which threat or issue
      // it broke, same as it does for a node deleted outright.
      if (!source || !target) return;
      edges.push({
        id,
        source,
        target,
        label,
        protocol: String(attrs["@_dfdProtocol"] ?? ""),
        data: splitList(attrs["@_dfdData"]),
        trustBoundaryCrossing: attrs["@_dfdTrustBoundaryCrossing"] === "1",
      });
      return;
    }
    nodes.push({
      id,
      type: (attrs["@_dfdType"] as string | undefined) ?? inferType(style),
      label,
      description: String(attrs["@_dfdDescription"] ?? ""),
      ...(attrs["@_dfdTrustBoundary"] ? { trustBoundary: String(attrs["@_dfdTrustBoundary"]) } : {}),
      ...(attrs["@_dfdProvider"] ? { provider: String(attrs["@_dfdProvider"]) } : {}),
      assets: splitList(attrs["@_dfdAssets"]),
    });
  };

  for (const obj of objects) {
    const cellField = obj.mxCell;
    const cell = Array.isArray(cellField) ? cellField[0] : cellField;
    if (cell) handle(obj, cell as RawAttrs);
  }
  for (const cell of bareCells) {
    if (cell["@_vertex"] === "1" || cell["@_edge"] === "1") handle({}, cell);
  }

  // Same root cause as the dangling-edge drop above: the real editor lets a
  // user delete a trust-boundary shape without clearing dfdTrustBoundary off
  // the nodes it contained, and lets a shape come in from draw.io's own
  // generic search sidebar with no label at all. Both used to reach
  // dfdGraphSchema.parse() below malformed and abort extraction with the
  // generic "couldn't read that diagram" error instead of either fixing
  // itself (unlabeled -> id) or routing through checkDfdReferences (orphaned
  // boundary -> just drop the dangling pointer, same as a dangling edge).
  const boundaryIds = new Set(trustBoundaries.map((b) => b.id as string));
  for (const node of nodes) {
    if (typeof node.trustBoundary === "string" && !boundaryIds.has(node.trustBoundary)) {
      delete node.trustBoundary;
    }
    if (!node.label) node.label = node.id;
  }

  return dfdGraphSchema.parse({ version: "1.0", nodes, edges, trustBoundaries });
}

/**
 * Generic referential check: does every affectedNodeIds/affectedEdgeIds
 * reference still resolve against this graph? Used to reject a DFD edit that
 * orphans a threat or architecture-issue reference. Deliberately NOT the same
 * function as validateSeedReferences (that operates on pre-mint, key-based
 * seed data) — this works on any already-UUID'd reference list.
 */
export function checkDfdReferences(
  graph: DfdGraph,
  refs: { label: string; affectedNodeIds: string[]; affectedEdgeIds: string[] }[],
): string[] {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edgeIds = new Set(graph.edges.map((e) => e.id));
  const errors: string[] = [];
  for (const ref of refs) {
    for (const id of ref.affectedNodeIds) if (!nodeIds.has(id)) errors.push(`${ref.label}: unknown node "${id}"`);
    for (const id of ref.affectedEdgeIds) if (!edgeIds.has(id)) errors.push(`${ref.label}: unknown edge "${id}"`);
  }
  return errors;
}
