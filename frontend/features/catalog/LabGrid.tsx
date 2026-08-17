import Link from "next/link";
import type { LabSummary } from "@curated-labs/shared";
import { tokens } from "@/lib/tokens";

export function LabGrid({
  labs,
  hrefBase = "/app/labs",
  emptyLabel = "No labs published yet.",
}: {
  labs: LabSummary[];
  /** Playground passes "/app/playground". Scenarios have no slug routing, so `lab.slug` is the scenario id. */
  hrefBase?: string;
  emptyLabel?: string;
}) {
  if (labs.length === 0) {
    return <p style={{ color: tokens.color.textMuted }}>{emptyLabel}</p>;
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: tokens.space(4) }}>
      {labs.map((lab) => (
        <li key={lab.id}>
          <Link
            href={`${hrefBase}/${lab.slug}`}
            style={{
              display: "block",
              height: "100%",
              padding: tokens.space(4),
              background: tokens.color.surface,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.lg,
              color: tokens.color.text,
              textDecoration: "none",
            }}
          >
            <div style={{ display: "flex", gap: tokens.space(2), fontSize: tokens.size.xs, color: tokens.color.textFaint, textTransform: "uppercase", letterSpacing: 0.8 }}>
              <span>{lab.category.name}</span>
              <span>·</span>
              <span>{lab.difficulty}</span>
              <span>·</span>
              <span>{lab.estimatedMinutes} min</span>
            </div>
            <h3 style={{ margin: `${tokens.space(2)} 0`, fontSize: tokens.size.lg }}>{lab.title}</h3>
            <p style={{ color: tokens.color.textMuted, fontSize: tokens.size.sm, lineHeight: 1.5, margin: 0 }}>{lab.summary}</p>
            {lab.attempt && (
              <div style={{ marginTop: tokens.space(3), fontSize: tokens.size.sm, color: lab.attempt.status === "completed" ? tokens.color.success : tokens.color.accent }}>
                {lab.attempt.status === "completed" ? "✓ Completed" : `Resume: ${lab.attempt.currentStep.replace(/_/g, " ")}`}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
