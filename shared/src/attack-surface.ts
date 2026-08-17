import type { DfdGraph } from "./schemas/dfd";

/**
 * A point where untrusted input can reach the system.
 *
 * Derived from the diagram rather than authored per lab. An attack surface is
 * definitionally a property of the architecture — every trust-boundary
 * crossing and every actor outside the system is one — so computing it keeps
 * the answer key correct for free, including for Playground scenarios nobody
 * hand-wrote and for curated labs whose DFD is later edited.
 */
export type AttackSurface = {
  /** The node or edge id this surface refers to. */
  id: string;
  kind: "node" | "edge";
  label: string;
  /** Why this counts, shown to the learner after they answer. */
  reason: string;
};

/** Node types that are, by definition, outside the system's control. */
const UNTRUSTED_NODE_TYPES = new Set(["external_entity", "third_party"]);

export function deriveAttackSurfaces(graph: DfdGraph): AttackSurface[] {
  const boundaryOf = new Map(graph.nodes.map((n) => [n.id, n.trustBoundary]));
  const labelOf = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const surfaces: AttackSurface[] = [];

  for (const node of graph.nodes) {
    if (!UNTRUSTED_NODE_TYPES.has(node.type)) continue;
    surfaces.push({
      id: node.id,
      kind: "node",
      label: node.label,
      reason:
        node.type === "third_party"
          ? "A third party you do not control. Whatever it sends you is untrusted input, and whatever you send it leaves your control."
          : "An external actor outside every trust boundary. Everything it submits is attacker-controlled until proven otherwise.",
    });
  }

  for (const edge of graph.edges) {
    // Trust the explicit flag, but also catch a flow between two different
    // zones that was never flagged — the crossing is what matters, and a
    // hand-edited or generated diagram can easily miss the boolean.
    const crosses =
      edge.trustBoundaryCrossing || boundaryOf.get(edge.source) !== boundaryOf.get(edge.target);
    if (!crosses) continue;
    const from = labelOf.get(edge.source) ?? edge.source;
    const to = labelOf.get(edge.target) ?? edge.target;
    surfaces.push({
      id: edge.id,
      kind: "edge",
      label: edge.label ? `${edge.label} (${from} → ${to})` : `${from} → ${to}`,
      reason: `This flow crosses a trust boundary, so ${to} has to treat everything arriving from ${from} as untrusted.`,
    });
  }

  return surfaces;
}

/**
 * Which surfaces the learner actually pointed at.
 *
 * Matching is on the ids they attached from the diagram, not on their prose —
 * the same deterministic-first rule the mitigation step uses. The AI explains
 * the result; it never decides it.
 */
export function gradeAttackSurfaces(
  canonical: AttackSurface[],
  referenced: { nodeIds: string[]; edgeIds: string[] },
): { identifiedIds: string[]; missedIds: string[]; identified: number; total: number } {
  const picked = new Set([...referenced.nodeIds, ...referenced.edgeIds]);
  const identifiedIds = canonical.filter((s) => picked.has(s.id)).map((s) => s.id);
  const missedIds = canonical.filter((s) => !picked.has(s.id)).map((s) => s.id);
  return { identifiedIds, missedIds, identified: identifiedIds.length, total: canonical.length };
}
