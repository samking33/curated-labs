"use client";

import { useState } from "react";
import type { LeaderboardEntry, LeaderboardResponse } from "@curated-labs/shared";
import { tokens } from "@/lib/tokens";

const MEDAL = ["#D4AF37", "#B7C0C7", "#B08D57"]; // gold, silver, bronze — ranks 1-3

export function LeaderboardView({
  global,
  organization,
  orgName,
}: {
  global: LeaderboardResponse;
  /** Null when the learner isn't in an organization — the tab doesn't render. */
  organization: LeaderboardResponse | null;
  orgName?: string;
}) {
  const [scope, setScope] = useState<"global" | "organization">("global");
  const board = scope === "organization" && organization ? organization : global;

  return (
    <div>
      {organization && (
        <div
          role="tablist"
          aria-label="Leaderboard scope"
          style={{
            display: "inline-flex",
            padding: 3,
            gap: 2,
            borderRadius: tokens.radius.pill,
            background: tokens.color.surfaceSunken,
            border: `1px solid ${tokens.color.border}`,
            marginBottom: tokens.space(5),
          }}
        >
          <TabButton active={scope === "global"} onClick={() => setScope("global")}>
            Global
          </TabButton>
          <TabButton active={scope === "organization"} onClick={() => setScope("organization")}>
            {orgName ?? "My organization"}
          </TabButton>
        </div>
      )}

      {board.entries.length === 0 ? (
        <p style={{ color: tokens.color.textMuted }}>
          No one has earned points here yet — be the first to finish a step.
        </p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: tokens.space(2) }}>
          {board.entries.map((e) => (
            <Row key={e.userId} entry={e} />
          ))}
        </ol>
      )}

      {/* Pinned separately when the viewer falls outside the visible ranks —
          otherwise "where am I?" has no answer on a board capped at N rows. */}
      {board.self && !board.entries.some((e) => e.userId === board.self!.userId) && (
        <>
          <div
            aria-hidden
            style={{
              textAlign: "center",
              color: tokens.color.textFaint,
              fontSize: tokens.size.sm,
              margin: `${tokens.space(3)} 0`,
            }}
          >
            ···
          </div>
          <Row entry={board.self} />
        </>
      )}

      {!board.self && (
        <p style={{ marginTop: tokens.space(5), color: tokens.color.textMuted, fontSize: tokens.size.sm }}>
          You haven&apos;t earned any points {scope === "organization" ? "in this organization " : ""}yet.
        </p>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: `${tokens.space(2)} ${tokens.space(5)}`,
        borderRadius: tokens.radius.pill,
        border: "none",
        cursor: "pointer",
        fontSize: tokens.size.base,
        fontFamily: tokens.font.sans,
        fontWeight: active ? 600 : 400,
        background: active ? tokens.color.surface : "transparent",
        color: active ? tokens.color.text : tokens.color.textMuted,
        boxShadow: active ? tokens.shadow.pill : "none",
      }}
    >
      {children}
    </button>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }) {
  const medal = MEDAL[entry.rank - 1];
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.space(4),
        padding: `${tokens.space(3)} ${tokens.space(5)}`,
        borderRadius: tokens.radius.lg,
        background: entry.isSelf ? tokens.color.accentSoft : tokens.color.surface,
        boxShadow: tokens.shadow.card,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          textAlign: "center",
          fontSize: tokens.size.lg,
          fontWeight: 700,
          color: medal ?? tokens.color.textMuted,
        }}
      >
        {entry.rank}
      </span>

      <Avatar name={entry.name} url={entry.avatarUrl} />

      <span style={{ flex: 1, minWidth: 0, fontSize: tokens.size.base, fontWeight: entry.isSelf ? 600 : 400 }}>
        {entry.name}
        {entry.isSelf && (
          <span style={{ marginLeft: tokens.space(2), fontSize: tokens.size.sm, color: tokens.color.accentInk }}>
            (you)
          </span>
        )}
      </span>

      <strong style={{ fontSize: tokens.size.lg, color: tokens.color.accentInk, whiteSpace: "nowrap" }}>
        {entry.points.toLocaleString()}
      </strong>
    </li>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        flexShrink: 0,
        overflow: "hidden",
        background: tokens.color.surfaceSunken,
        display: "grid",
        placeItems: "center",
        fontSize: tokens.size.sm,
        fontWeight: 600,
        color: tokens.color.textMuted,
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote avatar, no loader configured
        <img src={url} alt="" width={36} height={36} style={{ objectFit: "cover" }} />
      ) : (
        initial
      )}
    </span>
  );
}
