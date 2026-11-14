import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { dateFull, money, today } from "./api";
import { Empty } from "./components";
import { useI18n, type I18n } from "./i18n";
import { StatusPill } from "./Status";
import type { Action } from "./ActionModal";
import type { Family, Goal } from "./types";

/** Months left until the deadline; a started month counts as a whole one. */
export function monthsLeft(deadline: string, now = today()) {
  const [fromYear, fromMonth, fromDay] = now.split("-").map(Number);
  const [toYear, toMonth, toDay] = deadline.split("-").map(Number);
  const months =
    (toYear - fromYear) * 12 +
    (toMonth - fromMonth) +
    (toDay > fromDay ? 1 : 0);
  return Math.max(months, 1);
}

/** "180,000 ₸ to go · 25,715 ₸ a month until 1 Jun 2027", or null when reached. */
export function goalHint(goal: Goal, t: I18n["t"]) {
  const left = goal.target_kzt - goal.saved_kzt;
  if (left <= 0) return null;
  const rest = !goal.deadline
    ? t("goals.noDeadline")
    : goal.deadline < today()
      ? t("goals.overdue", { date: dateFull(goal.deadline) })
      : t("goals.perMonth", {
          amount: money(Math.ceil(left / monthsLeft(goal.deadline))),
          date: dateFull(goal.deadline),
        });
  return `${t("goals.left", { amount: money(left) })} · ${rest}`;
}

export default function Goals({
  goals,
  family,
  onAction,
}: {
  goals: Goal[];
  family: Family;
  onAction: (action: Action) => void;
}) {
  const { t } = useI18n();
  const admin = family.role === "Admin";
  const saved = goals.reduce((sum, goal) => sum + goal.saved_kzt, 0);
  const target = goals.reduce((sum, goal) => sum + goal.target_kzt, 0);
  if (!goals.length)
    return (
      <section className="panel">
        <Empty
          title={t("goals.emptyTitle")}
          action={
            admin && (
              <button
                className="button secondary"
                onClick={() => onAction({ kind: "goal" })}
              >
                <Plus size={16} /> {t("goals.new")}
              </button>
            )
          }
        >
          {t(admin ? "goals.emptyAdmin" : "goals.emptyMember")}
        </Empty>
      </section>
    );
  return (
    <>
      <div className="budget-intro">
        <div>
          <span className="eyebrow">{t("goals.eyebrow")}</span>
          <h2>
            {money(saved)}{" "}
            <span>{t("budget.ofLimit", { limit: money(target) })}</span>
          </h2>
          <p>{t(admin ? "goals.introAdmin" : "goals.introMember")}</p>
        </div>
      </div>
      <div className="budget-card-grid">
        {goals.map((goal) => {
          const percent = Math.floor((goal.saved_kzt / goal.target_kzt) * 100);
          const hint = goalHint(goal, t);
          return (
            <section className="panel goal-card" key={goal.id}>
              <div className="budget-row-top">
                <div className="category-name">
                  <span className="category-icon goal-icon">
                    <Target size={20} strokeWidth={1.7} />
                  </span>
                  <div>
                    <strong>{goal.name}</strong>
                    <span>
                      {money(goal.saved_kzt)}{" "}
                      <span className="muted">
                        {t("budget.ofLimit", { limit: money(goal.target_kzt) })}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="budget-left">
                  <strong>{percent}%</strong>
                </div>
              </div>
              <div className="progress-track">
                <div style={{ width: `${Math.min(percent, 100)}%` }} />
              </div>
              <p className="goal-hint">
                {hint ?? (
                  <StatusPill level="good">{t("goals.reached")}</StatusPill>
                )}
              </p>
              <div className="goal-actions">
                <button
                  className="text-button"
                  onClick={() => onAction({ kind: "contribute", goal })}
                >
                  <Plus size={14} /> {t("goals.contribute")}
                </button>
                {admin && (
                  <span>
                    <button
                      className="icon-button"
                      aria-label={t("house.editAria", { name: goal.name })}
                      onClick={() => onAction({ kind: "goal", goal })}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t("table.deleteAria", { name: goal.name })}
                      onClick={() => onAction({ kind: "delete-goal", goal })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
