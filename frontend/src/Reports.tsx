import { Download } from "lucide-react";
import { money, monthName } from "./api";
import { CategoryIcon, categoryStyle } from "./components";
import { SpendingChart } from "./Charts";
import { downloadCsv } from "./Transactions";
import type { Summary } from "./types";

export default function Reports({ summary }: { summary: Summary }) {
  const largest = [...summary.categories].sort(
    (a, b) => b.spent_kzt - a.spent_kzt,
  )[0];
  return (
    <>
      <div className="report-heading">
        <p>
          A clear record of where your household’s money went in{" "}
          {monthName(summary.month)}.
        </p>
        <button
          className="button secondary"
          onClick={() =>
            downloadCsv(`budget-report-${summary.month}.csv`, [
              [
                "Category",
                "Planned KZT",
                "Spent KZT",
                "Remaining KZT",
                "Used %",
              ],
              ...summary.categories.map((c) => [
                c.name,
                c.limit_kzt,
                c.spent_kzt,
                c.left_kzt,
                c.used_percent,
              ]),
              [
                "TOTAL",
                summary.planned_kzt,
                summary.spent_kzt,
                summary.remaining_kzt,
                null,
              ],
            ])
          }
        >
          <Download size={16} /> Export report
        </button>
      </div>
      <div className="report-metrics">
        <div>
          <span>Household income</span>
          <strong>{money(summary.income_kzt)}</strong>
        </div>
        <div>
          <span>Total spending</span>
          <strong>{money(summary.spent_kzt)}</strong>
        </div>
        <div>
          <span>Income less spending</span>
          <strong>{money(summary.balance_kzt)}</strong>
        </div>
        <div>
          <span>Largest spending category</span>
          <strong>
            {largest?.spent_kzt ? largest.name : "No spending yet"}
          </strong>
        </div>
      </div>
      <div className="reports-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Where it went</h2>
              <p>Share of saved expenses, by category</p>
            </div>
          </div>
          <div className="spending-breakdown">
            {summary.categories.map((category) => (
              <div key={category.id}>
                <div className="breakdown-label">
                  <span>
                    <CategoryIcon name={category.name} small />
                    {category.name}
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
              <h2>How the month unfolded</h2>
              <p>Spending compared with your budget pace</p>
            </div>
          </div>
          <SpendingChart summary={summary} />
          <p className="panel-empty-text">
            Solid line: saved expenses · Dotted line: planned daily pace
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>The numbers, together</h2>
            <p>
              Review entries are excluded. Categories without spending are
              included.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="align-right">Planned</th>
                <th className="align-right">Spent</th>
                <th className="align-right">Remaining</th>
                <th className="align-right">Used</th>
              </tr>
            </thead>
            <tbody>
              {summary.categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td className="align-right">
                    {c.limit_kzt === null ? "No limit" : money(c.limit_kzt)}
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
                <td>Household total</td>
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
