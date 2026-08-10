/**
 * Four interchangeable DFD skins. Everything visual lives here as data —
 * DfdCanvas / DfdNode / DfdEdge read the theme and stay dumb, so a fifth
 * skin is a new entry in this file and nothing else.
 */

export type ThemeId = "whiteboard" | "blueprint-iso" | "blueprint-line" | "iso-3d";

export type Face = { top: string; left: string; right: string };

export type DfdTheme = {
  id: ThemeId;
  label: string;
  hint: string;
  /** "flat" = straight top-down. "iso" = 2:1 isometric projection with extruded slabs. */
  projection: "flat" | "iso";
  /** Slab thickness in screen px. Ignored when projection is "flat". */
  depth: number;
  canvasBg: string;
  /** Page chrome around the canvas. */
  uiBg: string;
  uiText: string;
  uiMuted: string;
  uiPanel: string;
  uiBorder: string;
  font: string;
  grid: { size: number; color: string; width: number; majorEvery?: number; majorColor?: string } | null;
  /** Soft floor gradient under the diagram, iso themes only. */
  floor: string | null;
  node: {
    face: Face;
    stroke: string;
    strokeWidth: number;
    radius: number;
    dash?: string;
    label: string;
    sublabel: string;
    labelWeight: number;
    labelSize: number;
    uppercaseType: boolean;
    shadow: string | null;
  };
  edge: {
    stroke: string;
    width: number;
    dash?: string;
    crossingStroke: string;
    crossingDash: string;
    label: string;
    labelSize: number;
    arrowSize: number;
    arrowFilled: boolean;
  };
  boundary: { stroke: string; width: number; dash: string; fill: string; label: string };
  selected: { stroke: string; width: number; glow: string | null; face?: Face };
  hover: { stroke: string };
};

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';
const MARKER = '"Comic Sans MS", "Segoe Print", "Bradley Hand", ui-rounded, ' + SANS;

export const THEMES: Record<ThemeId, DfdTheme> = {
  /** 1. The regular whiteboard DFD. Paper, marker, no depth. */
  whiteboard: {
    id: "whiteboard",
    label: "Whiteboard",
    hint: "Classic flat DFD",
    projection: "flat",
    depth: 0,
    canvasBg: "#f7f6f1",
    uiBg: "#efeee8",
    uiText: "#1c1a17",
    uiMuted: "#6d675e",
    uiPanel: "#ffffff",
    uiBorder: "#d8d4c8",
    font: MARKER,
    grid: { size: 24, color: "#dcd8cc", width: 1 },
    floor: null,
    node: {
      face: { top: "#ffffff", left: "#ffffff", right: "#ffffff" },
      stroke: "#26221d",
      strokeWidth: 2.25,
      radius: 10,
      label: "#1c1a17",
      sublabel: "#7a736a",
      labelWeight: 700,
      labelSize: 14,
      uppercaseType: true,
      shadow: "0 2px 0 rgba(38,34,29,0.18)",
    },
    edge: {
      stroke: "#3a352e",
      width: 2,
      crossingStroke: "#c1442f",
      crossingDash: "8 5",
      label: "#5c554b",
      labelSize: 11,
      arrowSize: 9,
      arrowFilled: true,
    },
    boundary: { stroke: "#c1442f", width: 2, dash: "10 7", fill: "rgba(193,68,47,0.05)", label: "#c1442f" },
    selected: { stroke: "#1d6fd0", width: 3.5, glow: null },
    hover: { stroke: "#1d6fd0" },
  },

  /** 2. blueprint2 — navy grid, cyan wireframe slabs, dashed connectors. */
  "blueprint-iso": {
    id: "blueprint-iso",
    label: "Blueprint",
    hint: "Isometric wireframe on grid",
    projection: "iso",
    depth: 14,
    canvasBg: "#132a55",
    uiBg: "#0e2044",
    uiText: "#dbe8ff",
    uiMuted: "#7f9fd4",
    uiPanel: "#16305f",
    uiBorder: "#2d5391",
    font: SANS,
    grid: { size: 16, color: "rgba(140,180,240,0.10)", width: 1, majorEvery: 5, majorColor: "rgba(150,195,255,0.20)" },
    floor: null,
    node: {
      face: { top: "rgba(23,52,102,0.92)", left: "rgba(15,38,79,0.95)", right: "rgba(19,45,90,0.95)" },
      stroke: "#a8ccff",
      strokeWidth: 1.25,
      radius: 3,
      label: "#eaf3ff",
      sublabel: "#8fb4e8",
      labelWeight: 500,
      labelSize: 12.5,
      uppercaseType: true,
      shadow: null,
    },
    edge: {
      stroke: "#9dc4ff",
      width: 1.2,
      dash: "7 5",
      crossingStroke: "#ffd9a0",
      crossingDash: "3 4",
      label: "#a9c8f2",
      labelSize: 10,
      arrowSize: 8,
      arrowFilled: true,
    },
    boundary: { stroke: "rgba(168,204,255,0.5)", width: 1, dash: "4 6", fill: "rgba(168,204,255,0.04)", label: "#a8ccff" },
    selected: { stroke: "#5ef0ff", width: 2, glow: "0 0 14px rgba(94,240,255,0.75)" },
    hover: { stroke: "#d7e9ff" },
  },

  /** 3. blueprint design — near-black, hairline sketch, no grid. */
  "blueprint-line": {
    id: "blueprint-line",
    label: "Line sketch",
    hint: "Hairline isometric, dark",
    projection: "iso",
    depth: 12,
    canvasBg: "#0a0f1e",
    uiBg: "#070b16",
    uiText: "#e6ebf5",
    uiMuted: "#6f7a91",
    uiPanel: "#0e1526",
    uiBorder: "#1c2740",
    font: SANS,
    grid: { size: 96, color: "rgba(160,180,220,0.045)", width: 1 },
    floor: null,
    node: {
      face: { top: "rgba(255,255,255,0.015)", left: "rgba(255,255,255,0.03)", right: "rgba(0,0,0,0.25)" },
      stroke: "rgba(233,239,250,0.72)",
      strokeWidth: 0.85,
      radius: 1,
      label: "#eef3fb",
      sublabel: "#66748d",
      labelWeight: 400,
      labelSize: 12,
      uppercaseType: false,
      shadow: null,
    },
    edge: {
      stroke: "rgba(226,233,246,0.5)",
      width: 0.8,
      crossingStroke: "rgba(226,233,246,0.5)",
      crossingDash: "2 4",
      label: "#7d8aa3",
      labelSize: 9.5,
      arrowSize: 7,
      arrowFilled: false,
    },
    boundary: { stroke: "rgba(226,233,246,0.22)", width: 0.8, dash: "2 6", fill: "transparent", label: "#8794ad" },
    selected: { stroke: "#ffffff", width: 1.6, glow: "0 0 10px rgba(255,255,255,0.5)" },
    hover: { stroke: "#ffffff" },
  },

  /** 4. 3d - isometric — rendered slabs, shaded faces, floor, HUD chrome. */
  "iso-3d": {
    id: "iso-3d",
    label: "3D isometric",
    hint: "Shaded volumes, depth",
    projection: "iso",
    depth: 30,
    canvasBg: "#161c26",
    uiBg: "#0f141c",
    uiText: "#e8edf6",
    uiMuted: "#8b98ad",
    uiPanel: "#1a212c",
    uiBorder: "#2b3644",
    font: SANS,
    grid: null,
    floor: "radial-gradient(ellipse 70% 55% at 50% 62%, #333d4d 0%, #232b37 45%, #161c26 100%)",
    node: {
      face: { top: "#8e9bb0", left: "#4a5468", right: "#39414f" },
      stroke: "rgba(12,16,22,0.55)",
      strokeWidth: 1,
      radius: 2,
      label: "#0d1219",
      sublabel: "#39414f",
      labelWeight: 600,
      labelSize: 12.5,
      uppercaseType: true,
      shadow: "0 18px 30px rgba(0,0,0,0.45)",
    },
    edge: {
      stroke: "#aab6c8",
      width: 1.6,
      crossingStroke: "#ff8a4c",
      crossingDash: "6 5",
      label: "#c3cddc",
      labelSize: 10.5,
      arrowSize: 9,
      arrowFilled: true,
    },
    boundary: { stroke: "rgba(120,170,255,0.45)", width: 1.2, dash: "8 6", fill: "rgba(90,140,230,0.06)", label: "#8fb6ff" },
    selected: {
      stroke: "#5aa9ff",
      width: 2,
      glow: "0 0 26px rgba(90,169,255,0.8)",
      face: { top: "#cfe2ff", left: "#4d7fc4", right: "#3a63a0" },
    },
    hover: { stroke: "#9cc6ff" },
  },
};

export const THEME_ORDER: ThemeId[] = ["whiteboard", "blueprint-iso", "blueprint-line", "iso-3d"];

const COS30 = Math.cos(Math.PI / 6);

/** World coords -> screen coords for the theme's projection. */
export function project(theme: DfdTheme, x: number, y: number): { x: number; y: number } {
  if (theme.projection === "flat") return { x, y };
  return { x: (x - y) * COS30, y: (x + y) * 0.5 };
}
