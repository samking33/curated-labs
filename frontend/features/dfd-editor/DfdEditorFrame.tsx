"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compileToDrawioXml, type DfdGraph, type DfdSelection } from "@curated-labs/shared";
import { embedUrl, loadAction, parseDrawioMessage } from "./drawio-protocol";

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
      } else if (data.event === "select") {
        onSelectionChange(null); // no per-cell inspector yet — draw.io's own UI covers selection detail
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
