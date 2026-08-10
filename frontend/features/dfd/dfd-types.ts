/**
 * Re-exported from the shared package so the DFD renderer and the API cannot
 * drift apart on graph shape (§9).
 */
export {
  dfdGraphSchema,
  dfdNodeSchema,
  dfdEdgeSchema,
  dfdTrustBoundarySchema,
  dfdNodeTypeSchema,
} from "@curated-labs/shared";
export type {
  DfdGraph,
  DfdNode,
  DfdEdge,
  DfdTrustBoundary,
  DfdNodeType,
  DfdSelection,
} from "@curated-labs/shared";
