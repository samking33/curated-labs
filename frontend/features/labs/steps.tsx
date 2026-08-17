"use client";

import { useState } from "react";
import type { DfdSelection, LabDetail, StepResult } from "@curated-labs/shared";
import { Button, Card, Field, inputStyle } from "@/components/ui";
import { priorityColor, tokens } from "@/lib/tokens";

/**
 * The five guided steps (§8). Each is a controlled form that hands a validated
 * payload to LabShell; none of them talks to the API directly, so the workflow
 * has a single submission path with one retry story.
 */

const PRIORITIES = ["critical", "high", "medium", "low"] as const;

/* ------------------------------------------------------------ step 1 */

export function ArchitectureIssuesStep({
  selection,
  onSubmit,
  busy,
}: {
  selection: DfdSelection;
  onSubmit: (answer: { text: string; referencedNodeIds: string[]; referencedEdgeIds: string[] }) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [refs, setRefs] = useState<{ nodes: string[]; edges: string[] }>({ nodes: [], edges: [] });

  // §9 requires the DFD selection be referenceable from the answer.
  const attach = () => {
    if (!selection) return;
    setRefs((prev) =>
      selection.kind === "node"
        ? { ...prev, nodes: [...new Set([...prev.nodes, selection.node.id])] }
        : { ...prev, edges: [...new Set([...prev.edges, selection.edge.id])] },
    );
  };

  return (
    <Card>
      <StepHeading n={1} title="What looks risky, weak, or missing in this architecture?" />
      <Field label="Your analysis" hint="Describe what concerns you. There is no single right answer.">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          style={{ ...inputStyle, resize: "vertical", fontFamily: tokens.font.sans }}
          placeholder="Start with the trust boundaries — what crosses them, and what protects it?"
        />
      </Field>

      <RefPicker selection={selection} refs={refs} onAttach={attach} onClear={() => setRefs({ nodes: [], edges: [] })} />

      <Button
        onClick={() => onSubmit({ text, referencedNodeIds: refs.nodes, referencedEdgeIds: refs.edges })}
        disabled={busy || text.trim().length < 10}
      >
        {busy ? "Submitting…" : "Submit analysis"}
      </Button>
    </Card>
  );
}

/* ----------------------------------------------------------- step 1b */

/**
 * Attack surfaces: where untrusted input actually enters. Graded on what the
 * learner attaches from the diagram, not on the prose, so the picker is the
 * primary control here rather than a secondary one.
 */
export function AttackSurfacesStep({
  selection,
  onSubmit,
  busy,
}: {
  selection: DfdSelection;
  onSubmit: (answer: { text: string; referencedNodeIds: string[]; referencedEdgeIds: string[] }) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [refs, setRefs] = useState<{ nodes: string[]; edges: string[] }>({ nodes: [], edges: [] });
  const picked = refs.nodes.length + refs.edges.length;

  const attach = () => {
    if (!selection) return;
    setRefs((prev) =>
      selection.kind === "node"
        ? { ...prev, nodes: [...new Set([...prev.nodes, selection.node.id])] }
        : { ...prev, edges: [...new Set([...prev.edges, selection.edge.id])] },
    );
  };

  return (
    <Card>
      <StepHeading n={2} title="Where can untrusted input reach this system?" />
      <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, marginTop: 0 }}>
        Click a box or an arrow in the diagram, then attach it. An attack surface is anywhere data
        crosses a trust boundary, or anyone outside the system talks to it — not a weakness yet,
        just a way in.
      </p>

      <RefPicker selection={selection} refs={refs} onAttach={attach} onClear={() => setRefs({ nodes: [], edges: [] })} />

      <Field label="Why are those the ways in?" hint="One or two sentences on what an attacker controls at those points.">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          style={{ ...inputStyle, resize: "vertical", fontFamily: tokens.font.sans }}
          placeholder="e.g. the browser reaches the storefront over the public internet, so everything in that request is attacker-controlled"
        />
      </Field>

      <Button
        onClick={() => onSubmit({ text, referencedNodeIds: refs.nodes, referencedEdgeIds: refs.edges })}
        disabled={busy || picked === 0 || text.trim().length < 10}
      >
        {busy ? "Checking…" : picked === 0 ? "Attach at least one from the diagram" : `Submit ${picked} attack surface${picked === 1 ? "" : "s"}`}
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------ step 2 */

export function ThreatIdentificationStep({
  selection,
  onSubmit,
  busy,
  attemptNumber,
  retriesLeft,
  previousAnswer,
}: {
  selection: DfdSelection;
  onSubmit: (answer: { threats: string[]; referencedNodeIds: string[]; referencedEdgeIds: string[] }) => void;
  busy: boolean;
  attemptNumber: number;
  /** Attempts remaining before the canonical set is shown. */
  retriesLeft: number;
  /** Carried over on a retry so the learner adds to their answer, not restarts. */
  previousAnswer?: string[];
}) {
  // Seed from the previous attempt: on a retry the learner is adding what they
  // missed, and retyping four threats they already got right is pure friction.
  const [threats, setThreats] = useState<string[]>(
    previousAnswer?.length ? [...previousAnswer, ""] : [""],
  );
  const [refs, setRefs] = useState<{ nodes: string[]; edges: string[] }>({ nodes: [], edges: [] });

  const update = (i: number, value: string) =>
    setThreats((prev) => prev.map((t, idx) => (idx === i ? value : t)));
  const filled = threats.map((t) => t.trim()).filter(Boolean);

  return (
    <Card>
      <StepHeading n={3} title="What threats exist in this system?" />
      {attemptNumber > 1 && (
        <div
          role="status"
          style={{
            padding: tokens.space(3),
            marginBottom: tokens.space(3),
            border: `1px solid ${tokens.color.warning}`,
            borderRadius: tokens.radius.md,
            background: `${tokens.color.warning}12`,
            fontSize: tokens.size.sm,
            color: tokens.color.warning,
          }}
        >
          <strong>Try again — attempt {attemptNumber}.</strong>{" "}
          {retriesLeft > 0
            ? "Your previous answers are kept below. Read the coach's feedback and add what you missed."
            : "This is your last attempt; after it the full threat set is revealed so you can compare."}
        </div>
      )}
      <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm }}>
        One threat per line. Describe them in your own words — matching is on meaning, not wording.
      </p>

      <div style={{ display: "grid", gap: tokens.space(2), marginBottom: tokens.space(3) }}>
        {threats.map((threat, i) => (
          <div key={i} style={{ display: "flex", gap: tokens.space(2) }}>
            <input
              value={threat}
              onChange={(e) => update(i, e.target.value)}
              style={inputStyle}
              placeholder={i === 0 ? "e.g. an attacker who can read the cache could reuse a session" : "Another threat…"}
              aria-label={`Threat ${i + 1}`}
            />
            {threats.length > 1 && (
              <Button variant="ghost" onClick={() => setThreats((p) => p.filter((_, idx) => idx !== i))}>
                ×
              </Button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: tokens.space(2), marginBottom: tokens.space(4) }}>
        <Button variant="ghost" onClick={() => setThreats((p) => [...p, ""])}>
          Add another
        </Button>
      </div>

      <RefPicker
        selection={selection}
        refs={refs}
        onAttach={() => {
          if (!selection) return;
          setRefs((prev) =>
            selection.kind === "node"
              ? { ...prev, nodes: [...new Set([...prev.nodes, selection.node.id])] }
              : { ...prev, edges: [...new Set([...prev.edges, selection.edge.id])] },
          );
        }}
        onClear={() => setRefs({ nodes: [], edges: [] })}
      />

      <Button
        onClick={() => onSubmit({ threats: filled, referencedNodeIds: refs.nodes, referencedEdgeIds: refs.edges })}
        disabled={busy || filled.length === 0}
      >
        {busy ? "Checking…" : attemptNumber > 1 ? "Submit again" : "Submit threats"}
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------ step 3 */

export type RevealedThreat = NonNullable<StepResult["revealedThreats"]>[number];

export function PrioritizationStep({
  threats,
  onSubmit,
  busy,
}: {
  threats: RevealedThreat[];
  onSubmit: (answer: { items: { threatId: string; priority: string; rationale: string }[] }) => void;
  busy: boolean;
}) {
  const [items, setItems] = useState<Record<string, { priority: string; rationale: string }>>({});

  const set = (id: string, patch: Partial<{ priority: string; rationale: string }>) =>
    setItems((prev) => {
      // Defaults first, then the stored value, then the patch. Written as an
      // explicit merge because a literal before a spread silently loses to it.
      const current = prev[id] ?? { priority: "", rationale: "" };
      return { ...prev, [id]: { ...current, ...patch } };
    });

  const payload = threats
    .map((t) => ({ threatId: t.id, ...items[t.id] }))
    .filter((i): i is { threatId: string; priority: string; rationale: string } =>
      Boolean(i.priority && i.rationale?.trim()),
    );

  return (
    <Card>
      <StepHeading n={4} title="Prioritize the key threats and explain your reasoning." />
      <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm }}>
        The reasoning matters more than the label. A well-argued disagreement is a good answer.
      </p>

      <div style={{ display: "grid", gap: tokens.space(4), marginBottom: tokens.space(4) }}>
        {threats.map((threat) => (
          <div key={threat.id} style={{ borderLeft: `2px solid ${tokens.color.border}`, paddingLeft: tokens.space(3) }}>
            <strong>{threat.title}</strong>
            <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, margin: `${tokens.space(1)} 0 ${tokens.space(2)}` }}>
              {threat.description}
            </p>
            <div style={{ display: "flex", gap: tokens.space(2), marginBottom: tokens.space(2), flexWrap: "wrap" }}>
              {PRIORITIES.map((p) => {
                const active = items[threat.id]?.priority === p;
                return (
                  <button
                    key={p}
                    onClick={() => set(threat.id, { priority: p })}
                    aria-pressed={active}
                    style={{
                      padding: `${tokens.space(1)} ${tokens.space(3)}`,
                      borderRadius: tokens.radius.sm,
                      fontSize: tokens.size.sm,
                      cursor: "pointer",
                      textTransform: "capitalize",
                      background: active ? priorityColor[p] : "transparent",
                      color: active ? tokens.color.accentText : priorityColor[p],
                      border: `1px solid ${priorityColor[p]}`,
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <textarea
              value={items[threat.id]?.rationale ?? ""}
              onChange={(e) => set(threat.id, { rationale: e.target.value })}
              rows={2}
              placeholder="Why this priority?"
              aria-label={`Rationale for ${threat.title}`}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        ))}
      </div>

      <Button onClick={() => onSubmit({ items: payload })} disabled={busy || payload.length === 0}>
        {busy ? "Submitting…" : `Submit ${payload.length} of ${threats.length}`}
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------ step 4 */

export function MitigationMatchingStep({
  threats,
  mitigations,
  onSubmit,
  busy,
}: {
  threats: RevealedThreat[];
  mitigations: LabDetail["mitigationOptions"];
  onSubmit: (answer: { pairings: { threatId: string; mitigationId: string }[] }) => void;
  busy: boolean;
}) {
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const payload = Object.entries(pairs).map(([threatId, mitigationId]) => ({ threatId, mitigationId }));

  return (
    <Card>
      <StepHeading n={5} title="Match each threat to the best mitigation." />
      <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm }}>
        This is the one step with a definite answer. There are more mitigations than threats.
      </p>

      <div style={{ display: "grid", gap: tokens.space(3), marginBottom: tokens.space(4) }}>
        {threats.map((threat) => (
          <div key={threat.id} style={{ display: "grid", gap: tokens.space(1) }}>
            <label htmlFor={`m-${threat.id}`} style={{ fontSize: tokens.size.base }}>
              {threat.title}
            </label>
            <select
              id={`m-${threat.id}`}
              value={pairs[threat.id] ?? ""}
              onChange={(e) => setPairs((prev) => ({ ...prev, [threat.id]: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Choose a mitigation…</option>
              {mitigations.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <Button onClick={() => onSubmit({ pairings: payload })} disabled={busy || payload.length !== threats.length}>
        {busy ? "Checking…" : "Check matches"}
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------ step 5 */

const DECISIONS = [
  { value: "ship_it", label: "Ship it" },
  { value: "ship_with_conditions", label: "Ship with conditions" },
  { value: "do_not_ship", label: "Do not ship" },
] as const;

export function ReleaseDecisionStep({
  onSubmit,
  busy,
}: {
  onSubmit: (answer: { decision: "ship_it" | "ship_with_conditions" | "do_not_ship"; rationale: string; conditions?: string }) => void;
  busy: boolean;
}) {
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]["value"] | null>(null);
  const [rationale, setRationale] = useState("");
  const [conditions, setConditions] = useState("");

  return (
    <Card>
      <StepHeading n={6} title="Would you release this system?" />
      <div style={{ display: "flex", gap: tokens.space(2), marginBottom: tokens.space(4), flexWrap: "wrap" }}>
        {DECISIONS.map((d) => {
          const active = decision === d.value;
          return (
            <button
              key={d.value}
              onClick={() => setDecision(d.value)}
              aria-pressed={active}
              style={{
                padding: `${tokens.space(2)} ${tokens.space(4)}`,
                borderRadius: tokens.radius.md,
                fontSize: tokens.size.base,
                cursor: "pointer",
                background: active ? tokens.color.accent : "transparent",
                color: active ? tokens.color.accentText : tokens.color.text,
                border: `1px solid ${active ? tokens.color.accent : tokens.color.borderStrong}`,
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      <Field label="Your reasoning" hint="Anchor it to the threats you found and the mitigations you chose.">
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={5}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>

      {decision === "ship_with_conditions" && (
        <Field label="Conditions" hint="What must be true before this goes live?">
          <textarea
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>
      )}

      <Button
        onClick={() => decision && onSubmit({ decision, rationale, conditions: conditions || undefined })}
        disabled={busy || !decision || rationale.trim().length < 10}
      >
        {busy ? "Submitting…" : "Complete lab"}
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------- shared */

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <div style={{ marginBottom: tokens.space(3) }}>
      <div style={{ fontSize: tokens.size.xs, color: tokens.color.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>
        Step {n} of 5
      </div>
      <h2 style={{ margin: `${tokens.space(1)} 0 0`, fontSize: tokens.size.xl, fontWeight: 600 }}>{title}</h2>
    </div>
  );
}

function RefPicker({
  selection,
  refs,
  onAttach,
  onClear,
}: {
  selection: DfdSelection;
  refs: { nodes: string[]; edges: string[] };
  onAttach: () => void;
  onClear: () => void;
}) {
  const total = refs.nodes.length + refs.edges.length;
  // The embedded draw.io editor never emits the "select" postMessage event in
  // embed mode (confirmed against the vendored build), so `selection` is
  // permanently null here — there is no click-to-select in this editor.
  // Rendering the attach button disabled with "select something" copy would
  // tell the user to do something that's structurally impossible, so it only
  // renders on the (currently unreachable) chance a selection exists.
  if (!selection && total === 0) return null;
  return (
    <div style={{ marginBottom: tokens.space(4), fontSize: tokens.size.sm, color: tokens.color.textMuted }}>
      <div style={{ display: "flex", gap: tokens.space(2), alignItems: "center", flexWrap: "wrap" }}>
        {selection && (
          <Button variant="ghost" onClick={onAttach}>
            {`Attach "${selection.kind === "node" ? selection.node.label : selection.edge.label || selection.edge.id}"`}
          </Button>
        )}
        {total > 0 && (
          <>
            <span>
              {total} reference{total === 1 ? "" : "s"} attached
            </span>
            <Button variant="ghost" onClick={onClear}>
              Clear
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
