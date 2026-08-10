import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteProgress } from "@/components/RouteProgress";
import "./globals.css";

export const metadata: Metadata = {
  title: "Securacy",
  description: "AI-assisted threat modeling training",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        Browser extensions (Grammarly, password managers, translators) inject
        attributes onto <body> before React hydrates, which React then reports
        as a mismatch. This suppresses the warning for this element's own
        attributes only — children are still fully checked, so a real mismatch
        in the app is still caught.
      */}
      <body suppressHydrationWarning>
        {/* Scoped to just this component: useSearchParams() needs a Suspense
            boundary, and wrapping `children` in one too would let every page
            underneath suspend the whole app rather than just this bar. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
