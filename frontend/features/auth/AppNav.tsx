"use client";

import Link from "next/link";
import type { MeResponse } from "@curated-labs/shared";
import { api } from "@/lib/api";
import { tokens } from "@/lib/tokens";
import { SUPPORT_EMAIL } from "@/lib/support";

export function AppNav({ me }: { me: MeResponse }) {
  const org = me.organizations[0];
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  };

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.space(4),
        padding: `${tokens.space(3)} ${tokens.space(6)}`,
        borderBottom: `1px solid ${tokens.color.border}`,
        background: tokens.color.surface,
      }}
    >
      <Link href="/app" style={{ fontWeight: 600, color: tokens.color.text, textDecoration: "none" }}>
        Securacy
      </Link>
      <NavLink href="/app/catalog">Catalog</NavLink>
      <NavLink href="/app/playground">Playground</NavLink>
      {org && <NavLink href={`/app/org/${org.slug}`}>{org.name}</NavLink>}
      <NavLink href="/app/settings">Settings</NavLink>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: tokens.space(3) }}>
        <ReportIssueLink />
        <span style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted }}>{me.user.email}</span>
        <button
          onClick={logout}
          style={{ background: "none", border: "none", color: tokens.color.textMuted, cursor: "pointer", fontSize: tokens.size.sm, textDecoration: "underline" }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ color: tokens.color.textMuted, textDecoration: "none", fontSize: tokens.size.base }}>
      {children}
    </Link>
  );
}

/**
 * Somewhere to send a bug report from inside the product, rather than the
 * learner having to know who to tell. Deliberately a plain mailto: there is
 * no ticketing system behind this yet, and a link that opens a mail client
 * is honest about that.
 */
export function ReportIssueLink() {
  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Securacy issue report")}`}
      style={{ fontSize: tokens.size.sm, color: tokens.color.textMuted, textDecoration: "underline" }}
    >
      Report an issue
    </a>
  );
}
