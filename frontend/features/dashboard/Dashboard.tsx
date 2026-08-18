"use client";

import { useCallback, useState } from "react";
import { useRouter } from "@/lib/navigation";
import { LAB_STEPS, type MeResponse, type Progress } from "@curated-labs/shared";
import { tokens } from "@/lib/tokens";
import { formatTimeAgo } from "@/lib/format";
import { HeroHeader, TopNav } from "./Chrome";
import { PerformanceCard, type Range } from "./PerformanceCard";
import { WeeklyProgressCard, type DayState, type Segment } from "./WeeklyProgressCard";
import { AiAssistantCard } from "./AiAssistantCard";

/** The five lab steps, mapped onto the dial's checkpoints. */
const SEGMENTS: Segment[] = [
  { label: "Architecture", icon: "book", step: "architecture_issues" },
  { label: "Surfaces", icon: "book", step: "attack_surfaces" },
  { label: "Threats", icon: "headphones", step: "threats" },
  { label: "Priority", icon: "bulb", step: "prioritization" },
  { label: "Mitigations", icon: "badge", step: "mitigations" },
];

/** The dial counts the five answerable steps, so it walks the shared order
 *  rather than keeping a second copy that drifts when a step is added. */
const STEP_ORDER = LAB_STEPS;

export function Dashboard({
  me,
  progress,
  monthsByRange,
  learners,
  today,
  points,
  nowIso,
}: {
  me: MeResponse;
  progress: Progress | null;
  /** Pre-bucketed on the server so the range selector switches instantly. */
  monthsByRange: Record<Range, { label: string; value: number }[]>;
  learners: { name: string; avatarUrl?: string | null }[];
  today: { day: number; weekday: string; month: string; weekdayIndex: number };
  /** Null when the points fetch failed: the badge hides rather than lies. */
  points: number | null;
  /** Frozen server time. See lib/format.ts: never read a live clock here. */
  nowIso: string;
}) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("month");

  const started = progress?.labsStarted ?? 0;
  const completedLabs = progress?.labsCompleted ?? 0;
  const stepsSubmitted = progress?.stepsSubmitted ?? 0;

  const opened = Math.max(started * 5, 1);
  const completedPercent = Math.min(100, Math.round((stepsSubmitted / opened) * 100));

  /*
   * Derived from what was actually submitted, not from the date. Colouring
   * every past day as done said the same thing whether the learner had
   * worked all week or not touched it.
   */
  const week = progress?.week;
  const days: DayState[] = Array.from({ length: 7 }, (_, i) => {
    if ((week?.[i]?.length ?? 0) > 0) return "done";
    return i === today.weekdayIndex ? "current" : "todo";
  });

  const inFlight = progress?.recent.find((r) => r.status !== "completed");
  const stepNumber = inFlight ? STEP_ORDER.indexOf(inFlight.currentStep) : 0;
  // Real and derived from the attempt's actual startedAt: not a client-side
  // stopwatch. Both inputs are frozen props, so server and client agree.
  const startedAgo = inFlight ? formatTimeAgo(new Date(nowIso), new Date(inFlight.startedAt)) : null;

  const openLab = useCallback(
    (slug?: string) => router.push(slug ? `/app/labs/${slug}` : "/app/catalog"),
    [router],
  );
  const resumeOrBrowse = useCallback(() => openLab(inFlight?.labSlug), [openLab, inFlight?.labSlug]);

  return (
    <div style={{ minHeight: "100vh", background: tokens.color.bg, color: tokens.color.text }}>
      <div
        style={{
          background:
            // Reads left-to-right as the logo gradient does: violet, cyan, green.
            "radial-gradient(120% 150% at 78% -35%, #D8E9F7 0%, #D3ECEA 24%, #DDF0DC 44%, rgba(244,243,241,0) 70%)," +
            "radial-gradient(80% 110% at 12% -20%, rgba(190,168,214,0.42) 0%, rgba(244,243,241,0) 62%)," +
            "radial-gradient(90% 120% at 96% 6%, rgba(150,214,170,0.55) 0%, rgba(244,243,241,0) 60%)",
        }}
      >
        <TopNav name={me.user.name} avatarUrl={me.user.avatarUrl} points={points} onProfile={() => router.push("/app/settings")} />
        <HeroHeader
          firstName={me.user.name.split(" ")[0] ?? me.user.name}
          modulesThisWeek={completedLabs}
          today={today}
          hasLabInProgress={Boolean(inFlight)}
          onPrimaryAction={resumeOrBrowse}
          onAskCoach={() =>
            document.getElementById("ai-assistant")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
          }
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: tokens.space(5),
          padding: `0 ${tokens.space(8)} ${tokens.space(8)}`,
          alignItems: "stretch",
        }}
      >
        <PerformanceCard
          completedPercent={completedPercent}
          months={monthsByRange[range]}
          range={range}
          onRangeChange={setRange}
          highlightLabel={`${Math.max(completedLabs, 1)}+`}
          learners={learners}
          onConnect={() => router.push("/app/leaderboard")}
        />

        <WeeklyProgressCard
          days={days}
          week={week}
          onOpenDayLab={openLab}
          todayIndex={today.weekdayIndex}
          completed={stepNumber}
          total={5}
          segments={SEGMENTS}
          currentStep={inFlight?.currentStep}
          startedAgo={startedAgo}
          timerLabel={inFlight?.labTitle ?? "No lab in progress"}
          onOpenLab={resumeOrBrowse}
        />

        <div id="ai-assistant" style={{ display: "flex", minWidth: 0 }}>
          <AiAssistantCard onOpenProgress={() => router.push("/app/progress")} />
        </div>
      </div>
    </div>
  );
}
