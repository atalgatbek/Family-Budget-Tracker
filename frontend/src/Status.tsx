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
import { money, monthOnly, today } from "./api";
import { useI18n } from "./i18n";
import type { BudgetCategory, Summary } from "./types";

export type Level = "good" | "warning" | "critical";

const icons: Record<Level, LucideIcon> = {
  good: CircleCheck,
  warning: AlertTriangle,
  critical: CircleAlert,
};
const healthKeys = {
  good: "status.healthGood",
  warning: "status.healthWarning",
  critical: "status.healthCritical",
} as const;

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
  const { t } = useI18n();
  const Icon = icons[level];
  return (
    <span className={`status-pill ${level}`}>
      <Icon size={13} strokeWidth={2} />
      {children ?? t(`level.${level}`)}
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
  const { t } = useI18n();
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
  const headline = t(
    !hasPlan
      ? "status.noPlan"
      : overall === "critical"
        ? summary.remaining_kzt < 0
          ? "status.overMonth"
          : "status.overCategory"
        : overall === "warning"
          ? "status.closer"
          : "status.onTrack",
  );

  const tiles: {
    icon: LucideIcon;
    label: string;
    value: string;
    hint: string;
  }[] = [
    {
      icon: Gauge,
      label: t("status.pace"),
      value: !hasPlan
        ? "—"
        : paceGap > 0
          ? t("status.paceOver", { amount: money(paceGap) })
          : t("status.paceUnder", { amount: money(-paceGap) }),
      hint: hasPlan
        ? t("status.pacePlanned", { amount: money(expected) })
        : t("status.paceSetLimits"),
    },
    {
      icon: Wallet,
      label: t("status.safe"),
      value:
        hasPlan && daysLeft > 0
          ? money(Math.max(Math.floor(summary.remaining_kzt / daysLeft), 0))
          : "—",
      hint:
        daysLeft > 0
          ? t("status.safeLeft", {
              amount: money(Math.max(summary.remaining_kzt, 0)),
            })
          : t("status.safeClosed"),
    },
    {
      icon: CalendarDays,
      label: t("status.days"),
      value: String(daysLeft),
      hint: t("status.daysOf", { days, month: monthOnly(month) }),
    },
    {
      icon: PiggyBank,
      label: t("status.balance"),
      value: `${summary.balance_kzt < 0 ? "−" : ""}${money(Math.abs(summary.balance_kzt))}`,
      hint:
        summary.balance_kzt < 0
          ? t("status.balanceAbove")
          : t("status.balanceLeft"),
    },
  ];

  return (
    <section
      className={`panel status-panel ${overall}`}
      aria-label={t("status.aria")}
    >
      <div className="status-head">
        <div>
          <span className="eyebrow">{t("status.eyebrow")}</span>
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
            aria-label={t("status.healthAria", counts)}
          >
            {(Object.keys(counts) as Level[]).map(
              (level) =>
                counts[level] > 0 && (
                  <i
                    key={level}
                    className={level}
                    style={{ flexGrow: counts[level] }}
                    title={`${t(`level.${level}`)}: ${counts[level]}`}
                  />
                ),
            )}
          </div>
          <div className="health-legend">
            {(Object.keys(counts) as Level[]).map((level) => {
              const Icon = icons[level];
              return (
                <span key={level} className={`health-item ${level}`}>
                  <Icon size={13} strokeWidth={2} />
                  <strong>{counts[level]}</strong> {t(healthKeys[level])}
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
                  ? t("status.toReview", { count: summary.review_count })
                  : t("status.unbudgeted", {
                      amount: money(summary.unbudgeted_kzt),
                    })}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
