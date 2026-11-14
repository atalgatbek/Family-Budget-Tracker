import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CircleHelp,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { dateLabel, initials, money, monthOnly, number } from "./api";
import { useI18n } from "./i18n";
import { BudgetRow, CategoryIcon, Empty } from "./components";
import { SpendingChart } from "./Charts";
import StatusPanel from "./Status";
import RatesPanel from "./Rates";
import type { Action } from "./ActionModal";
import type { Expense, Family, Workspace } from "./types";

export function ExpenseTable({
  items,
  onEdit,
  family,
  compact = false,
  onDelete,
}: {
  items: Expense[];
  onEdit: (expense: Expense) => void;
  family: Family;
  compact?: boolean;
  onDelete?: (expense: Expense) => void;
}) {
  const { t, ts } = useI18n();
  return (
    <div className="table-scroll">
      <table className="expense-table">
        <thead>
          <tr>
            <th>{t("table.transaction")}</th>
            <th>{t("table.category")}</th>
            {!compact && <th>{t("table.addedBy")}</th>}
            <th>{t("table.date")}</th>
            <th className="align-right">{t("table.amount")}</th>
            {!compact && (
              <th>
                <span className="sr-only">{t("table.actions")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((expense) => (
            <tr key={expense.id}>
              <td>
                <button
                  className="transaction-title"
                  onClick={() => onEdit(expense)}
                >
                  <CategoryIcon name={expense.category_name} small />
                  <span>
                    <strong>{expense.note || ts(expense.category_name)}</strong>
                    <small>
                      {expense.reference}
                      {expense.status === "Needs review" && (
                        <span className="review-dot">
                          {" "}
                          · {ts("Needs review")}
                        </span>
                      )}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <span className="category-pill">
                  {ts(expense.category_name)}
                </span>
              </td>
              {!compact && (
                <td>
                  <span className="member-inline">
                    <span className="avatar tiny">
                      {initials(expense.user_name)}
                    </span>
                    {expense.user_name.split(" ")[0]}
                  </span>
                </td>
              )}
              <td className="muted no-wrap">
                {dateLabel(expense.expense_date)}
              </td>
              <td className="align-right expense-amount">
                −{money(expense.amount_kzt)}
              </td>
              {!compact && (
                <td>
                  <div className="row-actions">
                    {expense.has_receipt && (
                      <a
                        className="text-button"
                        href={`/api/families/${family.id}/expenses/${expense.id}/receipt`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("table.receipt")}
                      </a>
                    )}
                    <button
                      className="text-button"
                      onClick={() => onEdit(expense)}
                    >
                      {t("common.edit")}
                    </button>
                    {onDelete && (
                      <button
                        className="text-button danger-text"
                        aria-label={t("table.deleteAria", {
                          name: expense.note || expense.reference,
                        })}
                        onClick={() => onDelete(expense)}
                      >
                        {t("common.delete")}
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Overview({
  data,
  family,
  month,
  onAction,
  navigate,
}: {
  data: Workspace;
  family: Family;
  month: string;
  onAction: (action: Action) => void;
  navigate: (view: string) => void;
}) {
  const { t, ts } = useI18n();
  const { summary } = data;
  const percentage = summary.planned_kzt
    ? Math.round((summary.spent_kzt / summary.planned_kzt) * 100)
    : 0;
  const alertCategory = [...summary.categories]
    .filter((c) => c.limit_kzt && (c.used_percent ?? 0) >= 85)
    .sort((a, b) => (b.used_percent ?? 0) - (a.used_percent ?? 0))[0];
  return (
    <>
      <section className="stats-grid" aria-label={t("stat.aria")}>
        <div className="stat-card balance-card">
          <div className="stat-label">
            <span>{t("stat.left")}</span>
            <Wallet size={18} />
          </div>
          <div className="stat-value">
            {number(summary.remaining_kzt)}
            <span>₸</span>
          </div>
          <div className="balance-meter">
            <div style={{ width: `${Math.min(percentage, 100)}%` }} />
          </div>
          <div className="stat-foot">
            <span>{t("stat.used", { percent: percentage })}</span>
            <span>
              {t("stat.planned", { amount: money(summary.planned_kzt) })}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <span>{t("stat.spent")}</span>
            <span className="stat-icon expense">
              <ArrowUpRight size={18} />
            </span>
          </div>
          <div className="stat-value">
            {number(summary.spent_kzt)}
            <span>₸</span>
          </div>
          <div className="stat-foot">
            <span>{t("stat.spentFoot")}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <span>{t("stat.income")}</span>
            <span className="stat-icon income">
              <ArrowDownLeft size={18} />
            </span>
          </div>
          <div className="stat-value">
            {number(summary.income_kzt)}
            <span>₸</span>
          </div>
          <div className="stat-foot">
            <button
              className="text-button"
              onClick={() => onAction({ kind: "income" })}
            >
              {t("action.addIncome")} <Plus size={13} />
            </button>
            <span>{t("stat.householdTotal")}</span>
          </div>
        </div>
      </section>
      <StatusPanel summary={summary} month={month} navigate={navigate} />
      <RatesPanel />
      <div className="overview-grid">
        <div className="overview-main">
          <section className="panel spending-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("chart.title")}</h2>
                <p>{t("chart.sub")}</p>
              </div>
              <span className="quiet-badge">
                <TrendingUp size={13} /> {t("chart.cumulative")}
              </span>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-spent" /> {t("chart.spending")}
              </span>
              <span>
                <i className="legend-budget" /> {t("chart.pace")}
              </span>
              <small>KZT</small>
            </div>
            <SpendingChart summary={summary} />
            <div className="chart-note">
              <CircleHelp size={14} />
              <span>{t("chart.note", { month: monthOnly(month) })}</span>
            </div>
          </section>
          <section className="panel recent-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("recent.title")}</h2>
                <p>
                  {t(
                    family.role === "Admin"
                      ? "recent.subAdmin"
                      : "recent.subMember",
                  )}
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("transactions")}
              >
                {t("common.viewAll")} <ArrowRight size={15} />
              </button>
            </div>
            {data.recent.items.length ? (
              <ExpenseTable
                items={data.recent.items}
                onEdit={(expense) => onAction({ kind: "expense", expense })}
                family={family}
                compact
              />
            ) : (
              <Empty
                title={t("recent.emptyTitle")}
                action={
                  <button
                    className="button secondary"
                    onClick={() => onAction({ kind: "expense" })}
                  >
                    <Plus size={16} /> {t("action.addAnExpense")}
                  </button>
                }
              >
                {t("recent.emptyText")}
              </Empty>
            )}
          </section>
        </div>
        <aside className="overview-aside">
          <section className="panel budget-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("plan.title")}</h2>
                <p>{t("plan.sub")}</p>
              </div>
            </div>
            <div className="budget-rows">
              {summary.categories
                .filter((item) => item.limit_kzt !== null)
                .map((category) => (
                  <BudgetRow key={category.id} category={category} />
                ))}
            </div>
            {!summary.categories.some((item) => item.limit_kzt) && (
              <Empty title={t("plan.emptyTitle")}>
                {t(
                  family.role === "Admin"
                    ? "plan.emptyAdmin"
                    : "plan.emptyMember",
                )}
              </Empty>
            )}
            <button
              className="panel-bottom-link"
              onClick={() => navigate("budgets")}
            >
              {t(family.role === "Admin" ? "plan.manage" : "plan.see")}
              <ArrowRight size={16} />
            </button>
          </section>
          <section className="little-note">
            <span className="note-eyebrow">{t("heads.eyebrow")}</span>
            <h3>
              {alertCategory
                ? t(
                    alertCategory.used_percent! >= 100
                      ? "heads.over"
                      : "heads.close",
                    { name: ts(alertCategory.name) },
                  )
                : t("heads.none")}
            </h3>
            <p>
              {alertCategory
                ? t(
                    alertCategory.left_kzt! < 0
                      ? "heads.textOver"
                      : "heads.textLeft",
                    { amount: money(Math.abs(alertCategory.left_kzt!)) },
                  )
                : t("heads.textNone")}
            </p>
            {alertCategory && family.role === "Admin" && (
              <button
                className="text-button"
                onClick={() => onAction({ kind: "transfer" })}
              >
                {t("heads.action")} <ArrowRight size={14} />
              </button>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
