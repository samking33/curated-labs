"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compileToDrawioXml, type DfdGraph, type DfdSelection } from "@curated-labs/shared";
import { embedUrl, loadAction, parseDrawioMessage, type DrawioEvent } from "./drawio-protocol";

/** Looks up the full node/edge the bridge script's raw kind/id refers to in
 *  the graph we already loaded — never trusts a client-reconstructed object
 *  built from raw XML attributes. Falls back to null for an id the current
 *  graph doesn't recognize (stale message from a graph that's since changed). */
function resolveSelection(data: Extract<DrawioEvent, { event: "dfd-selection" }>, graph: DfdGraph): DfdSelection {
  if (data.kind === "node") {
    const node = graph.nodes.find((n) => n.id === data.id);
    return node ? { kind: "node", node } : null;
  }
  if (data.kind === "edge") {
    const edge = graph.edges.find((e) => e.id === data.id);
    return edge ? { kind: "edge", edge } : null;
  }
  return null;
}

export function DfdEditorFrame({
  graph,
  mode,
  onSelectionChange,
  onSave,
}: {
  graph: DfdGraph;
  mode: "view" | "edit";
  onSelectionChange: (selection: DfdSelection) => void;
  /** Called with the raw draw.io XML on save. Extraction and referential
   *  validation happen server-side (PATCH .../dfd) — never trust a
   *  client-derived DfdGraph for the authoritative check. */
  onSave?: (xml: string) => void | Promise<void>;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
  }, [graph, mode]);

  useEffect(() => {
    function handleMessage(evt: MessageEvent) {
      if (evt.source !== frameRef.current?.contentWindow) return;
      const data = parseDrawioMessage(evt.data);
      if (!data) return;

      if (data.event === "init" && !loadedRef.current) {
        loadedRef.current = true;
        frameRef.current?.contentWindow?.postMessage(JSON.stringify(loadAction(compileToDrawioXml(graph))), "*");
      } else if (data.event === "save" && mode === "edit") {
        onSave?.(data.xml);
      } else if (data.event === "dfd-selection") {
        onSelectionChange(resolveSelection(data, graph));
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [graph, mode, onSave, onSelectionChange]);

  // embedUrl's clibs param (edit mode only) needs an absolute origin — see
  // its own comment. That's a browser-only value, so the src is built after
  // mount rather than during render: computing it during render would give
  // the server and the client different values for the same attribute (no
  // window on the server), which React flags as a hydration mismatch. This
  // way the initial render (server and client alike) has no src, and the
  // iframe only starts loading once, with the right URL, post-mount.
  const [src, setSrc] = useState<string | null>(null);
  const providers = useMemo(
    () => [...new Set(graph.nodes.map((n) => n.provider).filter((p): p is "aws" | "azure" | "gcp" => Boolean(p)))],
    [graph],
  );
  useEffect(() => {
    setSrc(embedUrl(mode, window.location.origin, providers));
  }, [mode, providers]);

  return (
    <iframe
      ref={frameRef}
      title="DFD diagram"
      src={src ?? undefined}
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}
