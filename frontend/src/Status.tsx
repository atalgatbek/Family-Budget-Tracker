import {
  AlertTriangle,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Gauge,
  PiggyBank,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { money, monthName, today } from "./api";
import type { BudgetCategory, Summary } from "./types";

export type Level = "good" | "warning" | "critical";

export const levels: Record<Level, { label: string; icon: LucideIcon }> = {
  good: { label: "On track", icon: CircleCheck },
  warning: { label: "Close to limit", icon: AlertTriangle },
  critical: { label: "Over budget", icon: CircleAlert },
};

export const categoryLevel = (category: BudgetCategory): Level | null => {
  if (category.limit_kzt === null || category.used_percent === null)
    return null;
  if (category.used_percent > 100) return "critical";
  return category.used_percent >= 85 ? "warning" : "good";
};

export function StatusPill({
  level,
  children,
}: {
  level: Level;
  children?: string;
}) {
  const { icon: Icon, label } = levels[level];
  return (
    <span className={`status-pill ${level}`}>
      <Icon size={13} strokeWidth={2} />
      {children ?? label}
    </span>
  );
}

export default function StatusPanel({
  summary,
  month,
  navigate,
}: {
  summary: Summary;
  month: string;
  navigate: (view: string) => void;
}) {
  const now = today();
  const days = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const current = now.slice(0, 7);
  // Days already started in the selected month (all of them for past months).
  const elapsed =
    month < current ? days : month > current ? 0 : Number(now.slice(8));
  const daysLeft = month === current ? days - elapsed + 1 : days - elapsed;
  const expected = Math.round((summary.planned_kzt / days) * elapsed);
  const paceGap = summary.spent_kzt - expected;
  const hasPlan = summary.planned_kzt > 0;

  const limited = summary.categories.filter((c) => categoryLevel(c));
  const count = (level: Level) =>
    limited.filter((c) => categoryLevel(c) === level).length;
  const counts = {
    good: count("good"),
    warning: count("warning"),
    critical: count("critical"),
  };

  const overall: Level =
    summary.remaining_kzt < 0 || counts.critical
      ? "critical"
      : counts.warning || (hasPlan && paceGap > summary.planned_kzt * 0.05)
        ? "warning"
        : "good";
  const headline = !hasPlan
    ? "No monthly plan yet"
    : overall === "critical"
      ? summary.remaining_kzt < 0
        ? "The month is over budget"
        : "A category is over its limit"
      : overall === "warning"
        ? "Worth a closer look"
        : "Everything is on track";

  const tiles: {
    icon: LucideIcon;
    label: string;
    value: string;
    hint: string;
  }[] = [
    {
      icon: Gauge,
      label: "Spending pace",
      value: !hasPlan
        ? "—"
        : paceGap > 0
          ? `${money(paceGap)} over pace`
          : `${money(-paceGap)} under pace`,
      hint: hasPlan
        ? `Planned by now: ${money(expected)}`
        : "Set category limits to see your pace",
    },
    {
      icon: Wallet,
      label: "Safe to spend per day",
      value:
        hasPlan && daysLeft > 0
          ? money(Math.max(Math.floor(summary.remaining_kzt / daysLeft), 0))
          : "—",
      hint:
        daysLeft > 0
          ? `${money(Math.max(summary.remaining_kzt, 0))} left in the plan`
          : "This month is closed",
    },
    {
      icon: CalendarDays,
      label: "Days left",
      value: String(daysLeft),
      hint: `of ${days} in ${monthName(month).split(" ")[0]}`,
    },
    {
      icon: PiggyBank,
      label: "Income minus spending",
      value: `${summary.balance_kzt < 0 ? "−" : ""}${money(Math.abs(summary.balance_kzt))}`,
      hint:
        summary.balance_kzt < 0
          ? "Spending is above income"
          : "Left after all expenses",
    },
  ];

  return (
    <section
      className={`panel status-panel ${overall}`}
      aria-label="Budget status"
    >
      <div className="status-head">
        <div>
          <span className="eyebrow">BUDGET STATUS</span>
          <h2>{headline}</h2>
        </div>
        {hasPlan && <StatusPill level={overall} />}
      </div>
      <div className="status-tiles">
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <div className="status-tile" key={label}>
            <span className="status-tile-label">
              <Icon size={14} strokeWidth={1.8} /> {label}
            </span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </div>
        ))}
      </div>
      {limited.length > 0 && (
        <div className="status-health">
          <div
            className="health-bar"
            role="img"
            aria-label={`${counts.good} categories on track, ${counts.warning} close to the limit, ${counts.critical} over budget`}
          >
            {(Object.keys(counts) as Level[]).map(
              (level) =>
                counts[level] > 0 && (
                  <i
                    key={level}
                    className={level}
                    style={{ flexGrow: counts[level] }}
                    title={`${levels[level].label}: ${counts[level]}`}
                  />
                ),
            )}
          </div>
          <div className="health-legend">
            {(Object.keys(counts) as Level[]).map((level) => {
              const Icon = levels[level].icon;
              return (
                <span key={level} className={`health-item ${level}`}>
                  <Icon size={13} strokeWidth={2} />
                  <strong>{counts[level]}</strong>{" "}
                  {levels[level].label.toLowerCase()}
                </span>
              );
            })}
            {(summary.review_count > 0 || summary.unbudgeted_kzt > 0) && (
              <button
                className="text-button"
                onClick={() =>
                  navigate(summary.review_count ? "transactions" : "budgets")
                }
              >
                {summary.review_count > 0
                  ? `${summary.review_count} to review`
                  : `${money(summary.unbudgeted_kzt)} without a limit`}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
