import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
  X,
} from "lucide-react";
import { api, dateLabel, messageOf, money } from "./api";
import { Empty, ErrorNotice, Loading } from "./components";
import { ExpenseTable } from "./Overview";
import type { Action } from "./ActionModal";
import type { ExpensePage, Family, Workspace } from "./types";

export function downloadCsv(
  filename: string,
  rows: (string | number | null)[][],
) {
  const content = rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");
          const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8;" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Transactions({
  family,
  month,
  revision,
  data,
  onAction,
}: {
  family: Family;
  month: string;
  revision: number;
  data: Workspace;
  onAction: (action: Action) => void;
}) {
  const [tab, setTab] = useState<"expenses" | "income">("expenses");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ExpensePage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const params = new URLSearchParams({
    month,
    page: String(page),
    page_size: "15",
    search,
  });
  if (category) params.set("category_id", category);
  if (status) params.set("status", status);
  const query = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timeout = window.setTimeout(
      () => {
        api<ExpensePage>(`/families/${family.id}/expenses?${query}`, {
          signal: controller.signal,
        })
          .then((value) => {
            setResult(value);
            setError("");
          })
          .catch((error) => {
            if (!controller.signal.aborted) setError(messageOf(error));
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [family.id, query, revision, search]);
  async function exportRows() {
    setExporting(true);
    setError("");
    try {
      if (tab === "income")
        downloadCsv(`income-${month}.csv`, [
          ["Date", "Source", "Member", "Amount KZT"],
          ...data.income.map((row) => [
            row.income_date,
            row.source,
            row.user_name,
            row.amount_kzt,
          ]),
        ]);
      else {
        const rows: ExpensePage["items"] = [];
        let next = 1;
        let total = 0;
        do {
          const options = new URLSearchParams(query);
          options.set("page", String(next));
          options.set("page_size", "100");
          const response = await api<ExpensePage>(
            `/families/${family.id}/expenses?${options}`,
          );
          rows.push(...response.items);
          total = response.total;
          next++;
          if (response.items.length === 0) break;
        } while (rows.length < total);
        downloadCsv(`expenses-${month}.csv`, [
          [
            "Reference",
            "Date",
            "Description",
            "Category",
            "Member",
            "Status",
            "Amount KZT",
          ],
          ...rows.map((row) => [
            row.reference,
            row.expense_date,
            row.note,
            row.category_name,
            row.user_name,
            row.status,
            row.amount_kzt,
          ]),
        ]);
      }
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="panel transaction-panel">
      <div className="transaction-toolbar">
        <div className="tabs">
          <button
            className={tab === "expenses" ? "active" : ""}
            onClick={() => setTab("expenses")}
          >
            Expenses <span>{result?.total ?? "—"}</span>
          </button>
          <button
            className={tab === "income" ? "active" : ""}
            onClick={() => setTab("income")}
          >
            Income <span>{data.income.length}</span>
          </button>
        </div>
        <button
          className="button secondary small-button"
          onClick={exportRows}
          disabled={exporting}
        >
          <Download size={15} />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      {family.role === "Member" && (
        <p className="access-note">
          You can see and manage your own transactions. The overview includes
          your whole household’s totals.
        </p>
      )}
      {tab === "expenses" && (
        <div className="filters">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search expenses"
              placeholder="Search your expenses…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {data.categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option>Saved</option>
            <option>Needs review</option>
          </select>
          {(search || category || status) && (
            <button
              className="icon-button"
              aria-label="Clear filters"
              onClick={() => {
                setSearch("");
                setCategory("");
                setStatus("");
                setPage(1);
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}
      {error && <ErrorNotice message={error} />}
      {tab === "expenses" ? (
        loading ? (
          <Loading />
        ) : result?.items.length ? (
          <>
            <ExpenseTable
              items={result.items}
              family={family}
              onEdit={(expense) => onAction({ kind: "expense", expense })}
              onDelete={(expense) =>
                onAction({ kind: "delete-expense", expense })
              }
            />
            <div className="pagination">
              <span>
                {(page - 1) * 15 + 1}–{Math.min(page * 15, result.total)} of{" "}
                {result.total} expenses
              </span>
              <div>
                <button
                  className="icon-button"
                  disabled={page === 1}
                  aria-label="Previous page"
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>Page {page}</span>
                <button
                  className="icon-button"
                  disabled={page * 15 >= result.total}
                  aria-label="Next page"
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            title={
              search || category || status
                ? "Nothing matches just yet"
                : "No expenses this month"
            }
            action={
              <button
                className="button secondary"
                onClick={() => onAction({ kind: "expense" })}
              >
                <Plus size={16} /> Add expense
              </button>
            }
          >
            Try another filter, or add your first expense.
          </Empty>
        )
      ) : data.income.length ? (
        <div className="income-list">
          {data.income.map((row) => (
            <div className="income-row" key={row.id}>
              <span className="stat-icon income">
                <ArrowDownLeft size={20} />
              </span>
              <div>
                <strong>{row.source}</strong>
                <small>
                  {row.user_name} · {dateLabel(row.income_date)}
                </small>
              </div>
              <strong className="income-amount">
                +{money(row.amount_kzt)}
              </strong>
              <button
                className="text-button danger-text"
                onClick={() => onAction({ kind: "delete-income", income: row })}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="A place for what comes in"
          action={
            <button
              className="button secondary"
              onClick={() => onAction({ kind: "income" })}
            >
              <Plus size={16} /> Add income
            </button>
          }
        >
          Track salaries, freelance work, and other household income here.
        </Empty>
      )}
    </section>
  );
}
