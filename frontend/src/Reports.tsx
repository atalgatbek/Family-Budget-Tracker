import { Download } from "lucide-react";
import { money, monthInText } from "./api";
import { useI18n } from "./i18n";
import { CategoryIcon, categoryStyle } from "./components";
import { SpendingChart } from "./Charts";
import { downloadCsv } from "./Transactions";
import type { Summary } from "./types";

export default function Reports({ summary }: { summary: Summary }) {
  const { t, ts } = useI18n();
  const largest = [...summary.categories].sort(
    (a, b) => b.spent_kzt - a.spent_kzt,
  )[0];
  return (
    <>
      <div className="report-heading">
        <p>{t("reports.intro", { month: monthInText(summary.month) })}</p>
        <button
          className="button secondary"
          onClick={() =>
            downloadCsv(`budget-report-${summary.month}.csv`, [
              [
                t("csv.category"),
                t("csv.planned"),
                t("csv.spent"),
                t("csv.remaining"),
                t("csv.used"),
              ],
              ...summary.categories.map((c) => [
                ts(c.name),
                c.limit_kzt,
                c.spent_kzt,
                c.left_kzt,
                c.used_percent,
              ]),
              [
                t("csv.total"),
                summary.planned_kzt,
                summary.spent_kzt,
                summary.remaining_kzt,
                null,
              ],
            ])
          }
        >
          <Download size={16} /> {t("reports.export")}
        </button>
      </div>
      <div className="report-metrics">
        <div>
          <span>{t("reports.income")}</span>
          <strong>{money(summary.income_kzt)}</strong>
        </div>
        <div>
          <span>{t("reports.spending")}</span>
          <strong>{money(summary.spent_kzt)}</strong>
        </div>
        <div>
          <span>{t("reports.balance")}</span>
          <strong>{money(summary.balance_kzt)}</strong>
        </div>
        <div>
          <span>{t("reports.largest")}</span>
          <strong>
            {largest?.spent_kzt ? ts(largest.name) : t("reports.noSpending")}
          </strong>
        </div>
      </div>
      <div className="reports-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("reports.whereTitle")}</h2>
              <p>{t("reports.whereSub")}</p>
            </div>
          </div>
          <div className="spending-breakdown">
            {summary.categories.map((category) => (
              <div key={category.id}>
                <div className="breakdown-label">
                  <span>
                    <CategoryIcon name={category.name} small />
                    {ts(category.name)}
                  </span>
                  <strong>{money(category.spent_kzt)}</strong>
                </div>
                <div className="progress-track">
                  <div
                    style={{
                      width: `${summary.spent_kzt ? (category.spent_kzt / summary.spent_kzt) * 100 : 0}%`,
                      background: categoryStyle(category.name).color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("reports.unfoldTitle")}</h2>
              <p>{t("reports.unfoldSub")}</p>
            </div>
          </div>
          <SpendingChart summary={summary} />
          <p className="panel-empty-text">{t("reports.legend")}</p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{t("reports.numbersTitle")}</h2>
            <p>{t("reports.numbersSub")}</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("table.category")}</th>
                <th className="align-right">{t("reports.planned")}</th>
                <th className="align-right">{t("reports.spent")}</th>
                <th className="align-right">{t("reports.remaining")}</th>
                <th className="align-right">{t("reports.used")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{ts(c.name)}</strong>
                  </td>
                  <td className="align-right">
                    {c.limit_kzt === null
                      ? t("budget.noLimit")
                      : money(c.limit_kzt)}
                  </td>
                  <td className="align-right">{money(c.spent_kzt)}</td>
                  <td
                    className={`align-right ${(c.left_kzt ?? 0) < 0 ? "danger-text" : ""}`}
                  >
                    {c.left_kzt === null ? "—" : money(c.left_kzt)}
                  </td>
                  <td className="align-right">
                    {c.used_percent === null ? "—" : `${c.used_percent}%`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t("stat.householdTotal")}</td>
                <td className="align-right">{money(summary.planned_kzt)}</td>
                <td className="align-right">{money(summary.spent_kzt)}</td>
                <td className="align-right">{money(summary.remaining_kzt)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
