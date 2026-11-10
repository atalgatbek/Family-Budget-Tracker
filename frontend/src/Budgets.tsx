import { useEffect, useState } from "react";
import { ArrowLeftRight, History as HistoryIcon, Plus } from "lucide-react";
import { api, dateLabel, messageOf, money, monthName } from "./api";
import { BudgetRow, ErrorNotice } from "./components";
import { useI18n } from "./i18n";
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
  const { t, ts } = useI18n();
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
            {t("budgets.eyebrow", { month: monthName(month).toUpperCase() })}
          </span>
          <h2>
            {money(data.summary.planned_kzt)}{" "}
            <span>{t("budgets.purpose")}</span>
          </h2>
          <p>{t(admin ? "budgets.introAdmin" : "budgets.introMember")}</p>
        </div>
        {admin && (
          <div className="button-group">
            <button
              className="button secondary"
              onClick={() => onAction({ kind: "transfer" })}
            >
              <ArrowLeftRight size={17} /> {t("form.moveBudget")}
            </button>
            <button
              className="button primary"
              onClick={() => onAction({ kind: "limit" })}
            >
              <Plus size={17} /> {t("budgets.setLimit")}
            </button>
          </div>
        )}
      </div>
      {data.summary.unbudgeted_kzt > 0 && (
        <div className="info-notice">
          {t("budgets.unbudgeted", {
            amount: money(data.summary.unbudgeted_kzt),
          })}
        </div>
      )}
      <div className="budget-card-grid">
        {data.summary.categories.map((category) => (
          <section className="panel category-budget-card" key={category.id}>
            {!category.is_active && (
              <span className="quiet-badge">
                {t("budgets.archivedCategory")}
              </span>
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
                  ? t("budgets.ready")
                  : t("budgets.used", { percent: category.used_percent })}
              </span>
              <span>
                {t(
                  category.used_percent !== null && category.used_percent >= 100
                    ? "budgets.over"
                    : category.used_percent !== null &&
                        category.used_percent >= 85
                      ? "budgets.close"
                      : "budgets.room",
                )}
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
                <HistoryIcon size={18} /> {t("history.title")}
              </h2>
              <p>{t("history.sub")}</p>
            </div>
          </div>
          {error && <ErrorNotice message={error} />}
          {history.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("table.category")}</th>
                    <th>{t("history.change")}</th>
                    <th>{t("history.by")}</th>
                    <th>{t("table.date")}</th>
                    <th>{t("history.reason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{ts(row.category_name)}</strong>
                      </td>
                      <td>
                        {row.old_kzt === null
                          ? t("history.newLimit")
                          : money(row.old_kzt)}{" "}
                        <span className="muted">→</span> {money(row.new_kzt)}
                      </td>
                      <td>{row.changed_by}</td>
                      <td>{dateLabel(row.changed_at)}</td>
                      <td className="muted">{ts(row.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="panel-empty-text">{t("history.empty")}</p>
          )}
        </section>
      )}
    </>
  );
}
