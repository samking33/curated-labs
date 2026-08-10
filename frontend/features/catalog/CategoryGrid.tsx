import Link from "next/link";
import { tokens } from "@/lib/tokens";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  labCount: number;
  completedCount: number;
};

/** A visible sense of progress through each track is what makes practice stick. */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: tokens.space(4),
      }}
    >
      {categories.map((c) => {
        const pct = c.labCount ? Math.round((c.completedCount / c.labCount) * 100) : 0;
        const done = c.labCount > 0 && c.completedCount === c.labCount;
        return (
          <li key={c.id}>
            <Link
              href={`/app/catalog/${c.slug}`}
              style={{
                display: "block",
                height: "100%",
                padding: tokens.space(5),
                background: tokens.color.surface,
                border: `1px solid ${done ? tokens.color.success : tokens.color.border}`,
                borderRadius: tokens.radius.lg,
                color: tokens.color.text,
                textDecoration: "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h3 style={{ margin: 0, fontSize: tokens.size.lg }}>{c.name}</h3>
                {done && <span style={{ color: tokens.color.success, fontSize: tokens.size.sm }}>✓</span>}
              </div>
              <p
                style={{
                  color: tokens.color.textMuted,
                  fontSize: tokens.size.sm,
                  lineHeight: 1.5,
                  margin: `${tokens.space(2)} 0 ${tokens.space(4)}`,
                  minHeight: 42,
                }}
              >
                {c.description}
              </p>

              <div
                role="progressbar"
                aria-valuenow={c.completedCount}
                aria-valuemin={0}
                aria-valuemax={c.labCount}
                aria-label={`${c.name} progress`}
                style={{ height: 4, background: tokens.color.border, borderRadius: 2, overflow: "hidden" }}
              >
                <div style={{ width: `${pct}%`, height: "100%", background: done ? tokens.color.success : tokens.color.accent }} />
              </div>
              <div style={{ marginTop: tokens.space(2), fontSize: tokens.size.sm, color: tokens.color.textMuted }}>
                {c.completedCount} of {c.labCount} {c.labCount === 1 ? "lab" : "labs"} complete
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
