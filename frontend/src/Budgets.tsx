import { useEffect, useState } from "react";
import { ArrowLeftRight, History as HistoryIcon, Plus } from "lucide-react";
import { api, dateLabel, messageOf, money, monthName } from "./api";
import { BudgetRow, ErrorNotice } from "./components";
import type { Action } from "./ActionModal";
import type { Family, History, Workspace } from "./types";

export default function Budgets({
  family,
  month,
  data,
  revision,
  onAction,
}: {
  family: Family;
  month: string;
  data: Workspace;
  revision: number;
  onAction: (action: Action) => void;
}) {
  const [history, setHistory] = useState<History[]>([]);
  const [error, setError] = useState("");
  const admin = family.role === "Admin";
  useEffect(() => {
    if (!admin) return;
    const controller = new AbortController();
    api<History[]>(`/families/${family.id}/limit-history?month=${month}`, {
      signal: controller.signal,
    })
      .then((value) => {
        setHistory(value);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(messageOf(error));
      });
    return () => controller.abort();
  }, [family.id, month, admin, revision]);
  return (
    <>
      <div className="budget-intro">
        <div>
          <span className="eyebrow">
            YOUR PLAN FOR {monthName(month).toUpperCase()}
          </span>
          <h2>
            {money(data.summary.planned_kzt)} <span>given a purpose.</span>
          </h2>
          <p>
            {admin
              ? "Set a little aside for each part of family life. Adjust as you go."
              : "Your household’s shared plan. An admin can adjust monthly limits."}
          </p>
        </div>
        {admin && (
          <div className="button-group">
            <button
              className="button secondary"
              onClick={() => onAction({ kind: "transfer" })}
            >
              <ArrowLeftRight size={17} /> Move budget
            </button>
            <button
              className="button primary"
              onClick={() => onAction({ kind: "limit" })}
            >
              <Plus size={17} /> Set a limit
            </button>
          </div>
        )}
      </div>
      {data.summary.unbudgeted_kzt > 0 && (
        <div className="info-notice">
          {money(data.summary.unbudgeted_kzt)} has been spent in categories
          without a limit. It’s included in your total spending.
        </div>
      )}
      <div className="budget-card-grid">
        {data.summary.categories.map((category) => (
          <section className="panel category-budget-card" key={category.id}>
            {!category.is_active && (
              <span className="quiet-badge">Archived category</span>
            )}
            <BudgetRow
              category={category}
              onClick={
                admin ? () => onAction({ kind: "limit", category }) : undefined
              }
            />
            <div className="budget-card-foot">
              <span>
                {category.used_percent === null
                  ? "Ready for a plan"
                  : `${category.used_percent}% used`}
              </span>
              <span>
                {category.used_percent !== null && category.used_percent >= 100
                  ? "Over budget"
                  : category.used_percent !== null &&
                      category.used_percent >= 85
                    ? "Getting close"
                    : "Room for the everyday"}
              </span>
            </div>
          </section>
        ))}
      </div>
      {admin && (
        <section className="panel history-panel">
          <div className="panel-heading">
            <div>
              <h2>
                <HistoryIcon size={18} /> A record of the changes
              </h2>
              <p>Every limit adjustment, with who changed it and when.</p>
            </div>
          </div>
          {error && <ErrorNotice message={error} />}
          {history.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Change</th>
                    <th>By</th>
                    <th>Date</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.category_name}</strong>
                      </td>
                      <td>
                        {row.old_kzt === null
                          ? "New limit"
                          : money(row.old_kzt)}{" "}
                        <span className="muted">→</span> {money(row.new_kzt)}
                      </td>
                      <td>{row.changed_by}</td>
                      <td>{dateLabel(row.changed_at)}</td>
                      <td className="muted">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="panel-empty-text">
              No changes this month. Your next adjustment will appear here.
            </p>
          )}
        </section>
      )}
    </>
  );
}
