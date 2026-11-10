import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CircleHelp,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { dateLabel, initials, money, monthName, number } from "./api";
import { BudgetRow, CategoryIcon, Empty } from "./components";
import { SpendingChart } from "./Charts";
import StatusPanel from "./Status";
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
  return (
    <div className="table-scroll">
      <table className="expense-table">
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Category</th>
            {!compact && <th>Added by</th>}
            <th>Date</th>
            <th className="align-right">Amount</th>
            {!compact && (
              <th>
                <span className="sr-only">Actions</span>
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
                    <strong>{expense.note || expense.category_name}</strong>
                    <small>
                      {expense.reference}
                      {expense.status === "Needs review" && (
                        <span className="review-dot"> · Needs review</span>
                      )}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <span className="category-pill">{expense.category_name}</span>
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
                        Receipt
                      </a>
                    )}
                    <button
                      className="text-button"
                      onClick={() => onEdit(expense)}
                    >
                      Edit
                    </button>
                    {onDelete && (
                      <button
                        className="text-button danger-text"
                        aria-label={`Delete ${expense.note || expense.reference}`}
                        onClick={() => onDelete(expense)}
                      >
                        Delete
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
  const { summary } = data;
  const percentage = summary.planned_kzt
    ? Math.round((summary.spent_kzt / summary.planned_kzt) * 100)
    : 0;
  const alertCategory = [...summary.categories]
    .filter((c) => c.limit_kzt && (c.used_percent ?? 0) >= 85)
    .sort((a, b) => (b.used_percent ?? 0) - (a.used_percent ?? 0))[0];
  return (
    <>
      <section className="stats-grid" aria-label="Monthly totals">
        <div className="stat-card balance-card">
          <div className="stat-label">
            <span>Left in the monthly plan</span>
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
            <span>{percentage}% of budget used</span>
            <span>{money(summary.planned_kzt)} planned</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <span>Total spent</span>
            <span className="stat-icon expense">
              <ArrowUpRight size={18} />
            </span>
          </div>
          <div className="stat-value">
            {number(summary.spent_kzt)}
            <span>₸</span>
          </div>
          <div className="stat-foot">
            <span>Saved expenses this month</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <span>Total income</span>
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
              Add income <Plus size={13} />
            </button>
            <span>Household total</span>
          </div>
        </div>
      </section>
      <StatusPanel summary={summary} month={month} navigate={navigate} />
      <div className="overview-grid">
        <div className="overview-main">
          <section className="panel spending-panel">
            <div className="panel-heading">
              <div>
                <h2>The month, at a glance</h2>
                <p>Small purchases. The bigger picture.</p>
              </div>
              <span className="quiet-badge">
                <TrendingUp size={13} /> Cumulative spending
              </span>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-spent" /> Spending
              </span>
              <span>
                <i className="legend-budget" /> Budget pace
              </span>
              <small>KZT</small>
            </div>
            <SpendingChart summary={summary} />
            <div className="chart-note">
              <CircleHelp size={14} />
              <span>
                The dotted line spreads your monthly plan evenly across{" "}
                {monthName(month).split(" ")[0]}.
              </span>
            </div>
          </section>
          <section className="panel recent-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent transactions</h2>
                <p>
                  {family.role === "Admin"
                    ? "The everyday things your household spends on."
                    : "Your latest expenses. Household totals include everyone."}
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("transactions")}
              >
                View all <ArrowRight size={15} />
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
                title="A fresh page for this month"
                action={
                  <button
                    className="button secondary"
                    onClick={() => onAction({ kind: "expense" })}
                  >
                    <Plus size={16} /> Add an expense
                  </button>
                }
              >
                Your purchases will show up here as you add them.
              </Empty>
            )}
          </section>
        </div>
        <aside className="overview-aside">
          <section className="panel budget-panel">
            <div className="panel-heading">
              <div>
                <h2>A plan for every little thing</h2>
                <p>Your category budgets</p>
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
              <Empty title="Give your money a plan">
                {family.role === "Admin"
                  ? "Set your first category limit in Budgets."
                  : "Your household admin can set monthly limits."}
              </Empty>
            )}
            <button
              className="panel-bottom-link"
              onClick={() => navigate("budgets")}
            >
              {family.role === "Admin"
                ? "Manage monthly budgets"
                : "See monthly budgets"}
              <ArrowRight size={16} />
            </button>
          </section>
          <section className="little-note">
            <span className="note-eyebrow">A LITTLE HEADS-UP</span>
            <h3>
              {alertCategory
                ? `${alertCategory.name} is ${alertCategory.used_percent! >= 100 ? "over its limit" : "getting close"}.`
                : "A little awareness goes a long way."}
            </h3>
            <p>
              {alertCategory
                ? `${money(Math.abs(alertCategory.left_kzt!))} ${alertCategory.left_kzt! < 0 ? "over the plan" : "left for the month"}. A small adjustment now can give your household some breathing room.`
                : "Check in on your spending together. A shared plan is easier to keep."}
            </p>
            {alertCategory && family.role === "Admin" && (
              <button
                className="text-button"
                onClick={() => onAction({ kind: "transfer" })}
              >
                Make a little room <ArrowRight size={14} />
              </button>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
