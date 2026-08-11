import { z } from "zod";

/** PROJECT.md §9. Stable IDs — the renderer, prompts and analytics all key off them. */
export const dfdNodeTypeSchema = z.enum([
  "external_entity",
  "process",
  "data_store",
  "service",
  "queue",
  "third_party",
  "trust_boundary",
]);

/** Coarse cloud-vendor styling hint for the 4 infrastructure node types
 *  (process/service/data_store/queue). Never set on external_entity,
 *  third_party, or trust_boundary — those aren't "vendor-flavored." */
export const dfdNodeProviderSchema = z.enum(["aws", "azure", "gcp"]);
export type DfdNodeProvider = z.infer<typeof dfdNodeProviderSchema>;

export const dfdNodeSchema = z.object({
  id: z.string().min(1),
  type: dfdNodeTypeSchema,
  label: z.string().min(1),
  description: z.string().default(""),
  trustBoundary: z.string().optional(),
  provider: dfdNodeProviderSchema.optional(),
  assets: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

export const dfdEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().default(""),
  protocol: z.string().default(""),
  data: z.array(z.string()).default([]),
  trustBoundaryCrossing: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
});

export const dfdTrustBoundarySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(""),
});

export const dfdGraphSchema = z
  .object({
    version: z.string().default("1.0"),
    nodes: z.array(dfdNodeSchema),
    edges: z.array(dfdEdgeSchema),
    trustBoundaries: z.array(dfdTrustBoundarySchema).default([]),
  })
  // Dangling edges would render as invisible flows and silently corrupt AI
  // prompts, so reject the graph at the boundary rather than at paint time.
  .superRefine((graph, ctx) => {
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const boundaryIds = new Set(graph.trustBoundaries.map((b) => b.id));

    // Duplicate ids would make node lookup order-dependent and let an answer
    // key reference an element the learner never sees.
    if (nodeIds.size !== graph.nodes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: "duplicate node id" });
    }
    if (new Set(graph.edges.map((e) => e.id)).size !== graph.edges.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges"], message: "duplicate edge id" });
    }

    // Nodes, edges, and trust boundaries all compile to one draw.io document
    // (compileToDrawioXml) where every cell shares a single id namespace — a
    // node and a boundary reusing the same id renders as one mxGraph cell
    // silently overwriting the other (mxCodec "Duplicate ID"), corrupting
    // both. Each within-type check above misses this because it only looks
    // within its own array.
    const edgeIds = new Set(graph.edges.map((e) => e.id));
    for (const id of nodeIds) {
      if (edgeIds.has(id) || boundaryIds.has(id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: `id "${id}" is reused across node/edge/trust-boundary` });
      }
    }
    for (const id of boundaryIds) {
      if (edgeIds.has(id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trustBoundaries"], message: `id "${id}" is reused across node/edge/trust-boundary` });
      }
    }

    for (const edge of graph.edges) {
      for (const end of ["source", "target"] as const) {
        if (!nodeIds.has(edge[end])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["edges", edge.id, end],
            message: `edge ${edge.id} ${end} "${edge[end]}" is not a node id`,
          });
        }
      }
    }
    for (const node of graph.nodes) {
      if (node.trustBoundary && !boundaryIds.has(node.trustBoundary)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", node.id, "trustBoundary"],
          message: `node ${node.id} references unknown trust boundary "${node.trustBoundary}"`,
        });
      }
    }
  });

export type DfdNodeType = z.infer<typeof dfdNodeTypeSchema>;
export type DfdNode = z.infer<typeof dfdNodeSchema>;
export type DfdEdge = z.infer<typeof dfdEdgeSchema>;
export type DfdTrustBoundary = z.infer<typeof dfdTrustBoundarySchema>;
export type DfdGraph = z.infer<typeof dfdGraphSchema>;

export type DfdSelection =
  | { kind: "node"; node: DfdNode }
  | { kind: "edge"; edge: DfdEdge }
  | null;
