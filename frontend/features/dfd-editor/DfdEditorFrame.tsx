"use client";

import { useEffect, useRef } from "react";
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

  return (
    <iframe
      ref={frameRef}
      title="DFD diagram"
      src={embedUrl(mode)}
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}
