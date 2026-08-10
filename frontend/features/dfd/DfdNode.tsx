"use client";

import type { DfdNode as DfdNodeData } from "./dfd-types";
import type { Placed } from "./layout";
import { project, type DfdTheme, type Face } from "./themes";

const TYPE_LABEL: Record<DfdNodeData["type"], string> = {
  external_entity: "External entity",
  process: "Process",
  data_store: "Data store",
  service: "Service",
  queue: "Queue",
  third_party: "Third party",
  trust_boundary: "Trust boundary",
};

/**
 * Small icon marking node type.
 *
 * Skipped wherever the node BODY already is the shape (flat: process,
 * external_entity, data_store; iso: process, data_store — see SHAPED_IN_FLAT /
 * SHAPED_IN_ISO below) — drawing a tiny circle inside a body that is already a
 * circle is just noise. external_entity keeps its icon in iso: SVG polygons
 * can't have rounded corners, so its extruded slab is geometrically identical
 * to service's there, and the glyph is the only thing telling them apart.
 */
function Glyph({ type, stroke }: { type: DfdNodeData["type"]; stroke: string }) {
  const p = { fill: "none", stroke, strokeWidth: 1.4, strokeLinejoin: "round" as const };
  switch (type) {
    case "process":
      return <circle cx={0} cy={0} r={6} {...p} />;
    case "data_store":
      return (
        <g {...p}>
          <line x1={-7} y1={-4} x2={7} y2={-4} />
          <line x1={-7} y1={4} x2={7} y2={4} />
        </g>
      );
    case "external_entity":
      return <rect x={-6} y={-6} width={12} height={12} rx={0} {...p} />;
    case "service":
      return <rect x={-6} y={-6} width={12} height={12} rx={4} {...p} />;
    case "queue":
      return (
        <g {...p}>
          <path d="M-6-5v10M-2-5v10M2-5v10M6-5v10" />
        </g>
      );
    case "third_party":
      return <path d="M0-7 7 0 0 7-7 0Z" {...p} />;
    default:
      return null;
  }
}

type FlatBodyProps = {
  type: DfdNodeData["type"];
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashed?: string;
};

/**
 * The node's outline for the flat (top-down) themes, shaped per DFD notation
 * rather than one rounded rectangle wearing a different 12px icon.
 *
 * process → circle/ellipse, external_entity → sharp-cornered rectangle,
 * data_store → two open horizontal lines — this is the exact set the client
 * specified, cross-checked against Gane-Sarson notation and their own
 * reference diagram. `service`, `queue` and `third_party` are this app's own
 * extensions beyond classical DFD vocabulary (no client-specified symbol
 * exists for them), so they keep a rounded rect plus the small icon in
 * `Glyph` above.
 *
 * Iso (3D) themes use their own equivalent, `IsoBody` below.
 */
function FlatBody({ type, x, y, w, h, cx, cy, radius, fill, stroke, strokeWidth, dashed }: FlatBodyProps) {
  const common = { fill, stroke, strokeWidth, strokeDasharray: dashed };

  switch (type) {
    case "process":
      // An ellipse rather than a true circle: it fills the existing wide
      // label box without needing a second, incompatible layout footprint
      // just for this one type.
      return <ellipse cx={cx} cy={cy} rx={w / 2 - 2} ry={h / 2 - 2} {...common} />;

    case "external_entity":
      // Sharp corners are the whole point — this is what distinguishes it
      // from the rounded service/queue boxes at a glance.
      return <rect x={x} y={y} width={w} height={h} rx={0} {...common} />;

    case "data_store": {
      // Two bare horizontal lines, open on both sides, no enclosing box.
      // A transparent rect still needs to sit underneath: without real fill
      // there, an SVG <g> has no hit area between the two lines and clicking
      // the middle of the node would silently miss it.
      const lineW = w * 0.86;
      const y1 = y + h * 0.34;
      const y2 = y + h * 0.66;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="transparent" stroke="none" />
          <line x1={cx - lineW / 2} y1={y1} x2={cx + lineW / 2} y2={y1} stroke={stroke} strokeWidth={strokeWidth} />
          <line x1={cx - lineW / 2} y1={y2} x2={cx + lineW / 2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} />
        </g>
      );
    }

    default:
      // service, queue, third_party — no standard shape exists for these.
      return <rect x={x} y={y} width={w} height={h} rx={radius} {...common} />;
  }
}

/** Types whose flat body is already the shape — see FlatBody. */
const SHAPED_IN_FLAT = new Set<DfdNodeData["type"]>(["process", "external_entity", "data_store"]);
/** Types whose iso body is already the shape — see IsoBody. Narrower than
 *  SHAPED_IN_FLAT: external_entity's iso slab isn't visually distinct from
 *  service's, so it still needs its icon there. */
const SHAPED_IN_ISO = new Set<DfdNodeData["type"]>(["process", "data_store"]);

type Pt = { x: number; y: number };

type IsoBodyProps = {
  type: DfdNodeData["type"];
  corners: [Pt, Pt, Pt, Pt]; // projected top-face corners: a, b, c, dd
  centre: Pt; // projected centre of the top face
  depth: number;
  face: Face;
  stroke: string;
  strokeWidth: number;
  dashed?: string;
};

/**
 * The node's outline for the iso (3D) themes, shaped per type where a clean
 * projection exists.
 *
 * process becomes a puck (an isometric cylinder: two ellipses plus the
 * visible side band) rather than a box — the standard way to draw a
 * 3D-looking circle in an isometric scene, since a true circle sheared by the
 * projection is an ellipse, and building the extrusion around that ellipse
 * keeps it looking like solid geometry rather than a flat sticker.
 *
 * data_store drops the box entirely and draws its two lines projected
 * straight onto the top plane — a flat sheet in the 3D scene, matching the
 * "open, no volume" reading of the symbol in every 2D theme.
 *
 * external_entity needed no change: the existing rectangular slab already has
 * sharp corners (SVG polygons have no rounding to strip), which is the whole
 * of what distinguishes it from the rounded service/queue slabs.
 */
function IsoBody({ type, corners, centre, depth, face, stroke, strokeWidth, dashed }: IsoBodyProps) {
  const [a, b, c, dd] = corners;
  const poly = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const drop = (p: Pt) => ({ x: p.x, y: p.y + depth });

  if (type === "process") {
    // Ellipse sized to the projected rhombus's own bounding box, rather than
    // transforming a world-space circle through the projection matrix — this
    // reads correctly without solving for the transform's singular axes.
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const rx = (Math.max(...xs) - Math.min(...xs)) * 0.47;
    const ry = (Math.max(...ys) - Math.min(...ys)) * 0.47;
    const top = centre;
    const bottom = drop(centre);
    const leftTop = { x: top.x - rx, y: top.y };
    const rightTop = { x: top.x + rx, y: top.y };
    const leftBottom = { x: bottom.x - rx, y: bottom.y };
    const rightBottom = { x: bottom.x + rx, y: bottom.y };

    return (
      <g>
        {/* Side band: front-facing arcs of the top and bottom ellipses,
            joined by the puck's two visible vertical edges. */}
        <path
          d={`M ${leftTop.x} ${leftTop.y} A ${rx} ${ry} 0 0 0 ${rightTop.x} ${rightTop.y} L ${rightBottom.x} ${rightBottom.y} A ${rx} ${ry} 0 0 1 ${leftBottom.x} ${leftBottom.y} Z`}
          fill={face.left}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dashed}
        />
        <ellipse cx={top.x} cy={top.y} rx={rx} ry={ry} fill={face.top} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dashed} />
      </g>
    );
  }

  if (type === "data_store") {
    // No extrusion at all — this symbol has no volume in any theme. The two
    // lines are projected world-space segments, so they pick up the same
    // skew as everything else on the top plane.
    const midX = (a.x + b.x + c.x + dd.x) / 4;
    const midY = (a.y + b.y + c.y + dd.y) / 4;
    // "Above"/"below" centre along the rhombus's own vertical diagonal (a→c),
    // not screen-space y — that diagonal is the projected world y-axis.
    const along = (t: number): Pt => ({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
    const acrossWidth = 0.72;
    const at = (t: number, s: number): Pt => {
      const p = along(t);
      const dx = (b.x - dd.x) * s * acrossWidth * 0.5;
      const dy = (b.y - dd.y) * s * acrossWidth * 0.5;
      return { x: p.x + dx, y: p.y + dy };
    };
    const line1a = at(0.34, -1);
    const line1b = at(0.34, 1);
    const line2a = at(0.66, -1);
    const line2b = at(0.66, 1);
    return (
      <g>
        {/* Transparent hit area — two thin lines leave most of the footprint
            with nothing for the pointer to land on. */}
        <polygon points={poly([a, b, c, dd])} fill="transparent" stroke="none" />
        <line x1={line1a.x} y1={line1a.y} x2={line1b.x} y2={line1b.y} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={line2a.x} y1={line2a.y} x2={line2b.x} y2={line2b.y} stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  // external_entity, service, queue, third_party — the extruded slab. Sharp
  // corners for external_entity fall out for free: polygons don't round.
  return (
    <g>
      <polygon points={poly([dd, c, drop(c), drop(dd)])} fill={face.left} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dashed} />
      <polygon points={poly([c, b, drop(b), drop(c)])} fill={face.right} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dashed} />
      <polygon points={poly([a, b, c, dd])} fill={face.top} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dashed} />
    </g>
  );
}

type Props = {
  node: DfdNodeData;
  placed: Placed;
  theme: DfdTheme;
  selected: boolean;
  onSelect: () => void;
};

export function DfdNodeShape({ node, placed, theme, selected, onSelect }: Props) {
  const { x, y, w, h } = placed;
  const face = (selected && theme.selected.face) || theme.node.face;
  const stroke = selected ? theme.selected.stroke : theme.node.stroke;
  const strokeWidth = selected ? theme.selected.width : theme.node.strokeWidth;
  const dashed = node.type === "third_party" ? "6 4" : theme.node.dash;

  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  // Label anchor is the projected centre of the top face, upright in both
  // projections. ponytail: skewing text into the iso plane costs legibility
  // for nothing — the shapes already carry the perspective.
  const centre = project(theme, x + w / 2, y + h / 2);

  // The iso face is a rhombus, not a rectangle: its left edge runs down and to
  // the right, so a horizontally-centred line loses room as it moves down. At
  // the flat sublabel offset the edge is level with the text's left end, which
  // pushed "EXTERNAL ENTITY" straight through the slab. Tighten the stack for
  // iso so the widest line stays in the fat middle band.
  const iso = theme.projection === "iso";
  const glyphY = iso ? -21 : -19;
  const labelY = iso ? -1 : 4;
  const typeY = iso ? 11 : 18;

  const cx = x + w / 2;
  const cy = y + h / 2;

  const body =
    theme.projection === "flat" ? (
      <FlatBody
        type={node.type}
        x={x}
        y={y}
        w={w}
        h={h}
        cx={cx}
        cy={cy}
        radius={theme.node.radius}
        fill={face.top}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dashed={dashed}
      />
    ) : (
      <IsoBody
        type={node.type}
        corners={
          [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ].map(([px, py]) => project(theme, px, py)) as [Pt, Pt, Pt, Pt]
        }
        centre={centre}
        depth={theme.depth}
        face={face}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dashed={dashed}
      />
    );

  return (
    <g
      onClick={handle}
      style={{
        cursor: "pointer",
        filter: selected && theme.selected.glow ? `drop-shadow(${theme.selected.glow})` : undefined,
      }}
    >
      {body}
      <g transform={`translate(${centre.x} ${centre.y})`} pointerEvents="none">
        {/* Skip the icon wherever the body already IS the type — see
            SHAPED_IN_FLAT / SHAPED_IN_ISO. */}
        {!(iso ? SHAPED_IN_ISO : SHAPED_IN_FLAT).has(node.type) && (
          <g transform={`translate(0 ${glyphY})`}>
            <Glyph type={node.type} stroke={theme.node.sublabel} />
          </g>
        )}
        <text
          textAnchor="middle"
          y={labelY}
          fill={theme.node.label}
          fontFamily={theme.font}
          fontSize={theme.node.labelSize}
          fontWeight={theme.node.labelWeight}
        >
          {node.label}
        </text>
        <text
          textAnchor="middle"
          y={typeY}
          fill={theme.node.sublabel}
          fontFamily={theme.font}
          fontSize={theme.node.labelSize - 3.5}
          letterSpacing={theme.node.uppercaseType ? 0.8 : 0}
        >
          {theme.node.uppercaseType ? TYPE_LABEL[node.type].toUpperCase() : TYPE_LABEL[node.type]}
        </text>
      </g>
    </g>
  );
}

export { TYPE_LABEL };
