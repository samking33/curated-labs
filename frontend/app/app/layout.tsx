import { CoachBuddy } from "@/features/assistant/CoachBuddy";

/**
 * Wraps every signed-in page, so the coach is reachable from the catalogue, a
 * lab, or the dashboard without each page mounting it separately. It is not in
 * the root layout — /login and /onboarding have no session to chat about.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CoachBuddy />
    </>
  );
}
