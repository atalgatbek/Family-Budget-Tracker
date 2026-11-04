import { useRef, useState, type FormEvent } from "react";
import { Paperclip } from "lucide-react";
import { api, messageOf, money, today } from "./api";
import { ErrorNotice, Modal, SubmitButton } from "./components";
import type {
  BudgetCategory,
  Category,
  Expense,
  Family,
  Income,
  Workspace,
} from "./types";

export type Action =
  | { kind: "expense"; expense?: Expense }
  | { kind: "income" }
  | { kind: "limit"; category?: BudgetCategory }
  | { kind: "transfer" }
  | { kind: "category"; category?: Category }
  | { kind: "member" }
  | { kind: "family" }
  | { kind: "new-family" }
  | { kind: "delete-expense"; expense: Expense }
  | { kind: "delete-income"; income: Income };

export default function ActionModal({
  action,
  family,
  month,
  data,
  onClose,
  onSaved,
}: {
  action: Action;
  family: Family;
  month: string;
  data: Workspace;
  onClose: () => void;
  onSaved: (message: string, month?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const savedExpense = useRef<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const base = `/families/${family.id}`;
  const expense = action.kind === "expense" ? action.expense : undefined;
  const category =
    action.kind === "category" || action.kind === "limit"
      ? action.category
      : undefined;
  const activeCategories = data.categories.filter(
    (item) => item.is_active || item.id === expense?.category_id,
  );
  const titles: Record<Action["kind"], string> = {
    expense: expense ? "Edit expense" : "Add an expense",
    income: "Add income",
    limit: "Set a monthly limit",
    transfer: "Give your budget a little room",
    category: category ? "Edit category" : "New category",
    member: "Add a household member",
    family: "Your household",
    "new-family": "Create another household",
    "delete-expense": "Delete this expense?",
    "delete-income": "Delete this income?",
  };
  const subtitles: Partial<Record<Action["kind"], string>> = {
    expense: "A quick note now. A clearer picture later.",
    transfer:
      "Move part of one category’s limit to another. Your total plan stays the same.",
    member:
      "They’ll need an existing account. Use the email they signed up with.",
    limit: "A little intention for the month ahead.",
    category: "Keep your spending organized in a way that makes sense to you.",
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const values = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    const send = <T,>(path: string, body: unknown, method = "POST") =>
      api<T>(path, { method, body: JSON.stringify(body) });
    try {
      if (action.kind === "expense") {
        const payload = {
          amount_kzt: Number(values.amount_kzt),
          category_id: Number(values.category_id),
          expense_date: values.expense_date,
          note: values.note,
          status: values.status || "Saved",
        };
        let result: Expense;
        const existingId = expense?.id ?? savedExpense.current;
        if (existingId)
          result = await send<Expense>(
            `${base}/expenses/${existingId}`,
            payload,
            "PUT",
          );
        else
          result = await send<Expense>(`${base}/expenses`, {
            ...payload,
            client_request_id: requestId.current,
          });
        savedExpense.current = result.id;
        if (file) {
          const upload = new FormData();
          upload.append("file", file);
          try {
            await api(`${base}/expenses/${result.id}/receipt`, {
              method: "POST",
              body: upload,
            });
          } catch (error) {
            throw new Error(
              `The expense was saved, but the receipt wasn’t attached. ${messageOf(error)} Try saving again to retry the attachment.`,
            );
          }
        }
        onSaved(
          result.status === "Needs review"
            ? "Expense saved for review. It won’t count toward totals yet."
            : "Expense saved. Your household budget is up to date.",
          values.expense_date.slice(0, 7),
        );
      } else if (action.kind === "income") {
        await send(`${base}/income`, {
          source: values.source,
          amount_kzt: Number(values.amount_kzt),
          income_date: values.income_date,
          client_request_id: requestId.current,
        });
        onSaved(
          "Income added to your household.",
          values.income_date.slice(0, 7),
        );
      } else if (action.kind === "limit") {
        await send(
          `${base}/limits`,
          {
            category_id: Number(values.category_id),
            budget_month: month,
            limit_kzt: Number(values.limit_kzt),
          },
          "PUT",
        );
        onSaved("Monthly limit updated. The change is saved in your history.");
      } else if (action.kind === "transfer") {
        await send(`${base}/limits/transfer`, {
          source_category_id: Number(values.source_category_id),
          destination_category_id: Number(values.destination_category_id),
          budget_month: month,
          amount_kzt: Number(values.amount_kzt),
        });
        onSaved("Budget moved. Both limits have been updated together.");
      } else if (action.kind === "category") {
        await send(
          `${base}/categories${category ? `/${category.id}` : ""}`,
          { name: values.name, is_active: values.is_active === "true" },
          category ? "PUT" : "POST",
        );
        onSaved(
          category ? "Category updated." : "Category added to your household.",
        );
      } else if (action.kind === "member") {
        await send(`${base}/members`, {
          email: values.email,
          role: values.role,
        });
        onSaved("Your household has a new member.");
      } else if (action.kind === "family") {
        await send(base, { name: values.name }, "PATCH");
        onSaved("Household name updated.");
      } else if (action.kind === "new-family") {
        await send("/families", { name: values.name });
        onSaved("Household created. Choose it from the household menu.");
      } else if (action.kind === "delete-expense") {
        await api(`${base}/expenses/${action.expense.id}`, {
          method: "DELETE",
        });
        onSaved("Expense deleted. Your totals have been updated.");
      } else if (action.kind === "delete-income") {
        await api(`${base}/income/${action.income.id}`, { method: "DELETE" });
        onSaved("Income entry deleted.");
      }
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  const amount = (
    name: string,
    label: string,
    value?: number,
    max = 10000000,
  ) => (
    <label>
      {label}
      <div className="amount-field">
        <span>₸</span>
        <input
          name={name}
          type="number"
          min="1"
          max={max}
          step="1"
          inputMode="numeric"
          defaultValue={value}
          placeholder="0"
          required
          autoFocus
        />
      </div>
    </label>
  );
  const categorySelect = (
    name: string,
    label: string,
    defaultValue?: number,
    options = activeCategories,
  ) => (
    <label>
      {label}
      <select name={name} defaultValue={defaultValue ?? ""} required>
        <option value="" disabled>
          Choose a category
        </option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {!item.is_active ? " (archived)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Modal
      title={titles[action.kind]}
      subtitle={subtitles[action.kind]}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {action.kind === "expense" && (
            <>
              {amount("amount_kzt", "Amount", expense?.amount_kzt)}
              <div className="form-columns">
                {categorySelect(
                  "category_id",
                  "Category",
                  expense?.category_id,
                )}
                <label>
                  Date
                  <input
                    name="expense_date"
                    type="date"
                    max={today()}
                    defaultValue={expense?.expense_date ?? today()}
                    required
                  />
                </label>
              </div>
              <label>
                What was it for? <span className="muted">(optional)</span>
                <input
                  name="note"
                  maxLength={160}
                  placeholder="e.g. Weekly groceries at Magnum"
                  defaultValue={expense?.note}
                />
              </label>
              <label>
                Status
                <select name="status" defaultValue={expense?.status ?? "Saved"}>
                  <option>Saved</option>
                  <option>Needs review</option>
                </select>
              </label>
              <label className="upload-field">
                <Paperclip size={19} />
                <span>
                  <strong>
                    {file?.name ??
                      (expense?.has_receipt
                        ? "Replace receipt photo"
                        : "Attach a receipt")}
                  </strong>
                  <small>JPG, PNG or WebP · up to 5 MB</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected && selected.size > 5 * 1024 * 1024) {
                      setError("Choose a receipt smaller than 5 MB.");
                      e.target.value = "";
                      setFile(null);
                    } else {
                      setFile(selected ?? null);
                      setError("");
                    }
                  }}
                />
              </label>
              <p className="form-hint">
                Review entries are kept out of your budget totals until they’re
                marked Saved.
              </p>
            </>
          )}
          {action.kind === "income" && (
            <>
              {amount("amount_kzt", "Amount")}
              <label>
                Source
                <input
                  name="source"
                  placeholder="e.g. October salary"
                  maxLength={80}
                  required
                />
              </label>
              <label>
                Date received
                <input
                  name="income_date"
                  type="date"
                  max={today()}
                  defaultValue={today()}
                  required
                />
              </label>
            </>
          )}
          {action.kind === "limit" && (
            <>
              {categorySelect(
                "category_id",
                "Category",
                category?.id,
                data.categories,
              )}
              {amount(
                "limit_kzt",
                "Monthly limit",
                (category as BudgetCategory)?.limit_kzt ?? undefined,
                1000000000,
              )}
              <p className="form-hint">
                This changes the plan for {month} only.
              </p>
            </>
          )}
          {action.kind === "transfer" && (
            <>
              {categorySelect(
                "source_category_id",
                "Move from",
                undefined,
                data.summary.categories.filter(
                  (item) => item.limit_kzt !== null,
                ),
              )}
              {categorySelect(
                "destination_category_id",
                "Move to",
                undefined,
                data.summary.categories.filter(
                  (item) => item.limit_kzt !== null,
                ),
              )}
              {amount("amount_kzt", "Amount to move")}
              <p className="form-hint">
                The source category must keep a limit of at least ₸1.
              </p>
            </>
          )}
          {action.kind === "category" && (
            <>
              <label>
                Category name
                <input
                  name="name"
                  defaultValue={category?.name}
                  maxLength={30}
                  required
                  placeholder="e.g. Health & wellbeing"
                  autoFocus
                />
              </label>
              <label>
                Status
                <select
                  name="is_active"
                  defaultValue={
                    category?.is_active === false ? "false" : "true"
                  }
                >
                  <option value="true">Active</option>
                  <option value="false">Archived</option>
                </select>
              </label>
              <p className="form-hint">
                Archiving hides a category from new purchases. Its history stays
                intact.
              </p>
            </>
          )}
          {action.kind === "member" && (
            <>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  maxLength={100}
                  placeholder="name@example.com"
                  required
                  autoFocus
                />
              </label>
              <label>
                Household role
                <select name="role" defaultValue="Member">
                  <option>Member</option>
                  <option>Admin</option>
                </select>
              </label>
              <p className="form-hint">
                Members see household totals and manage their own expenses.
                Admins can manage all expenses, categories, and limits.
              </p>
            </>
          )}
          {(action.kind === "family" || action.kind === "new-family") && (
            <label>
              Household name
              <input
                name="name"
                maxLength={50}
                defaultValue={action.kind === "family" ? family.name : ""}
                placeholder="e.g. The Sadykov family"
                required
                autoFocus
              />
            </label>
          )}
          {action.kind === "delete-expense" && (
            <p className="delete-message">
              {action.expense.note || action.expense.category_name} ·{" "}
              <strong>{money(action.expense.amount_kzt)}</strong>
              <br />
              This will remove the expense and its receipt. This action cannot
              be undone.
            </p>
          )}
          {action.kind === "delete-income" && (
            <p className="delete-message">
              {action.income.source} ·{" "}
              <strong>{money(action.income.amount_kzt)}</strong>
              <br />
              This will remove the income entry and update your totals.
            </p>
          )}
        </fieldset>
        {error && <ErrorNotice message={error} />}
        <footer className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <SubmitButton busy={busy}>
            {action.kind.startsWith("delete")
              ? "Delete entry"
              : action.kind === "expense"
                ? "Save expense"
                : action.kind === "transfer"
                  ? "Move budget"
                  : "Save changes"}
          </SubmitButton>
        </footer>
      </form>
    </Modal>
  );
}
