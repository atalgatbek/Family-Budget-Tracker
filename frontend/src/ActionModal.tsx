import { useRef, useState, type FormEvent } from "react";
import { Copy, KeyRound, Paperclip } from "lucide-react";
import { api, messageOf, money, monthInText, today } from "./api";
import { useI18n } from "./i18n";
import { goalHint } from "./Goals";
import { ErrorNotice, Modal, SubmitButton } from "./components";
import type {
  BudgetCategory,
  Category,
  Expense,
  Family,
  Goal,
  Income,
  Member,
  PurchaseRequest,
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
  | { kind: "delete-income"; income: Income }
  | { kind: "goal"; goal?: Goal }
  | { kind: "contribute"; goal?: Goal }
  | { kind: "delete-goal"; goal: Goal }
  | { kind: "request" }
  | { kind: "reject-request"; request: PurchaseRequest }
  | { kind: "reset-code"; member: Member }
  | { kind: "password" }
  | { kind: "logout-all" };

export default function ActionModal({
  action,
  family,
  month,
  data,
  onClose,
  onSaved,
  onSignedOut,
}: {
  action: Action;
  family: Family;
  month: string;
  data: Workspace;
  onClose: () => void;
  onSaved: (message: string, month?: string) => void;
  onSignedOut: () => void;
}) {
  const { t, ts } = useI18n();
  const [busy, setBusy] = useState(false);
  // A reset code is shown once, inside the dialog, after it is issued.
  const [resetCode, setResetCode] = useState("");
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
  const goal =
    action.kind === "goal" ||
    action.kind === "contribute" ||
    action.kind === "delete-goal"
      ? action.goal
      : undefined;
  const activeCategories = data.categories.filter(
    (item) => item.is_active || item.id === expense?.category_id,
  );
  const titles: Record<Action["kind"], string> = {
    expense: t(expense ? "modal.expenseEdit" : "modal.expenseAdd"),
    income: t("modal.income"),
    limit: t("modal.limit"),
    transfer: t("modal.transfer"),
    category: t(category ? "modal.categoryEdit" : "modal.categoryNew"),
    member: t("modal.member"),
    family: t("modal.family"),
    "new-family": t("modal.newFamily"),
    "delete-expense": t("modal.deleteExpense"),
    "delete-income": t("modal.deleteIncome"),
    goal: t(goal ? "modal.goalEdit" : "modal.goalNew"),
    contribute: goal
      ? t("modal.contribute", { name: goal.name })
      : t("modal.contributeAny"),
    "delete-goal": t("modal.deleteGoal"),
    request: t("modal.request"),
    "reject-request": t("modal.rejectRequest"),
    "reset-code": t("modal.resetCode"),
    password: t("modal.password"),
    "logout-all": t("modal.logoutAll"),
  };
  const subtitles: Partial<Record<Action["kind"], string>> = {
    expense: t("modal.subExpense"),
    transfer: t("modal.subTransfer"),
    member: t("modal.subMember"),
    limit: t("modal.subLimit"),
    category: t("modal.subCategory"),
    goal: t("modal.subGoal"),
    contribute: goal
      ? (goalHint(goal, t) ?? t("goals.reached"))
      : t("modal.contributeAnySub"),
    request: t("modal.subRequest"),
    "reject-request":
      action.kind === "reject-request"
        ? `${action.request.note} · ${money(action.request.amount_kzt)} · ${action.request.user_name}`
        : "",
    "reset-code":
      action.kind === "reset-code"
        ? t("modal.subResetCode", { name: action.member.full_name })
        : "",
    password: t("modal.subPassword"),
    "logout-all": t("modal.subLogoutAll"),
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
              t("toast.receiptFailed", { error: ts(messageOf(error)) }),
            );
          }
        }
        onSaved(
          t(
            result.status === "Needs review"
              ? "toast.expenseReview"
              : "toast.expense",
          ),
          values.expense_date.slice(0, 7),
        );
      } else if (action.kind === "income") {
        await send(`${base}/income`, {
          source: values.source,
          amount_kzt: Number(values.amount_kzt),
          income_date: values.income_date,
          client_request_id: requestId.current,
        });
        onSaved(t("toast.income"), values.income_date.slice(0, 7));
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
        onSaved(t("toast.limit"));
      } else if (action.kind === "transfer") {
        await send(`${base}/limits/transfer`, {
          source_category_id: Number(values.source_category_id),
          destination_category_id: Number(values.destination_category_id),
          budget_month: month,
          amount_kzt: Number(values.amount_kzt),
        });
        onSaved(t("toast.transfer"));
      } else if (action.kind === "category") {
        await send(
          `${base}/categories${category ? `/${category.id}` : ""}`,
          { name: values.name, is_active: values.is_active === "true" },
          category ? "PUT" : "POST",
        );
        onSaved(t(category ? "toast.categoryUpdated" : "toast.categoryAdded"));
      } else if (action.kind === "member") {
        await send(`${base}/members`, {
          email: values.email,
          role: values.role,
        });
        onSaved(t("toast.member"));
      } else if (action.kind === "family") {
        await send(base, { name: values.name }, "PATCH");
        onSaved(t("toast.familyName"));
      } else if (action.kind === "new-family") {
        await send("/families", { name: values.name });
        onSaved(t("toast.familyCreated"));
      } else if (action.kind === "delete-expense") {
        await api(`${base}/expenses/${action.expense.id}`, {
          method: "DELETE",
        });
        onSaved(t("toast.expenseDeleted"));
      } else if (action.kind === "delete-income") {
        await api(`${base}/income/${action.income.id}`, { method: "DELETE" });
        onSaved(t("toast.incomeDeleted"));
      } else if (action.kind === "goal") {
        const body = {
          name: values.name,
          target_kzt: Number(values.target_kzt),
          deadline: values.deadline || null,
        };
        if (action.goal)
          await send(
            `${base}/goals/${action.goal.id}`,
            { ...body, saved_kzt: Number(values.saved_kzt) },
            "PUT",
          );
        else await send(`${base}/goals`, body);
        onSaved(t(action.goal ? "toast.goalUpdated" : "toast.goalCreated"));
      } else if (action.kind === "contribute") {
        const goalId = action.goal?.id ?? Number(values.goal_id);
        const result = await send<Goal>(
          `${base}/goals/${goalId}/contributions`,
          { amount_kzt: Number(values.amount_kzt) },
        );
        onSaved(
          t(
            result.saved_kzt >= result.target_kzt
              ? "toast.goalReached"
              : "toast.goalContributed",
          ),
        );
      } else if (action.kind === "delete-goal") {
        await api(`${base}/goals/${action.goal.id}`, { method: "DELETE" });
        onSaved(t("toast.goalDeleted"));
      } else if (action.kind === "request") {
        const result = await send<PurchaseRequest>(`${base}/requests`, {
          category_id: Number(values.category_id),
          amount_kzt: Number(values.amount_kzt),
          note: values.note,
        });
        onSaved(
          t(
            result.status === "approved"
              ? "toast.requestAuto"
              : "toast.requestSent",
          ),
        );
      } else if (action.kind === "reject-request") {
        await send(`${base}/requests/${action.request.id}/reject`, {
          reason: values.reason ?? "",
        });
        onSaved(t("toast.requestRejected"));
      } else if (action.kind === "reset-code") {
        const result = await send<{ code: string }>(
          `${base}/members/${action.member.id}/reset-code`,
          {},
        );
        setResetCode(result.code);
      } else if (action.kind === "password") {
        if (values.new_password !== values.repeat_password)
          throw new Error(t("form.passwordsDiffer"));
        await send("/auth/password", {
          current_password: values.current_password,
          new_password: values.new_password,
        });
        onSaved(t("toast.passwordChanged"));
      } else if (action.kind === "logout-all") {
        await send("/auth/logout-all", {});
        onSignedOut();
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
    { min = 1, focus = true } = {},
  ) => (
    <label>
      {label}
      <div className="amount-field">
        <span>₸</span>
        <input
          name={name}
          type="number"
          min={min}
          max={max}
          step="1"
          inputMode="numeric"
          defaultValue={value}
          placeholder="0"
          required
          autoFocus={focus}
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
          {t("form.chooseCategory")}
        </option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {ts(item.name)}
            {!item.is_active ? ` ${t("form.archivedSuffix")}` : ""}
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
              {amount("amount_kzt", t("form.amount"), expense?.amount_kzt)}
              <div className="form-columns">
                {categorySelect(
                  "category_id",
                  t("form.category"),
                  expense?.category_id,
                )}
                <label>
                  {t("form.date")}
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
                {t("form.whatFor")}{" "}
                <span className="muted">{t("form.optional")}</span>
                <input
                  name="note"
                  maxLength={160}
                  placeholder={t("form.notePh")}
                  defaultValue={expense?.note}
                />
              </label>
              <label>
                {t("form.status")}
                <select name="status" defaultValue={expense?.status ?? "Saved"}>
                  <option value="Saved">{ts("Saved")}</option>
                  <option value="Needs review">{ts("Needs review")}</option>
                </select>
              </label>
              <label className="upload-field">
                <Paperclip size={19} />
                <span>
                  <strong>
                    {file?.name ??
                      t(
                        expense?.has_receipt
                          ? "form.replaceReceipt"
                          : "form.attachReceipt",
                      )}
                  </strong>
                  <small>{t("form.receiptHint")}</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected && selected.size > 5 * 1024 * 1024) {
                      setError(t("form.receiptTooBig"));
                      e.target.value = "";
                      setFile(null);
                    } else {
                      setFile(selected ?? null);
                      setError("");
                    }
                  }}
                />
              </label>
              <p className="form-hint">{t("form.reviewHint")}</p>
            </>
          )}
          {action.kind === "income" && (
            <>
              {amount("amount_kzt", t("form.amount"))}
              <label>
                {t("form.source")}
                <input
                  name="source"
                  placeholder={t("form.sourcePh")}
                  maxLength={80}
                  required
                />
              </label>
              <label>
                {t("form.dateReceived")}
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
                t("form.category"),
                category?.id,
                data.categories,
              )}
              {amount(
                "limit_kzt",
                t("form.monthlyLimit"),
                (category as BudgetCategory)?.limit_kzt ?? undefined,
                1000000000,
              )}
              <p className="form-hint">
                {t("form.limitHint", { month: monthInText(month) })}
              </p>
            </>
          )}
          {action.kind === "transfer" && (
            <>
              {categorySelect(
                "source_category_id",
                t("form.moveFrom"),
                undefined,
                data.summary.categories.filter(
                  (item) => item.limit_kzt !== null,
                ),
              )}
              {categorySelect(
                "destination_category_id",
                t("form.moveTo"),
                undefined,
                data.summary.categories.filter(
                  (item) => item.limit_kzt !== null,
                ),
              )}
              {amount("amount_kzt", t("form.amountToMove"))}
              <p className="form-hint">{t("form.transferHint")}</p>
            </>
          )}
          {action.kind === "category" && (
            <>
              <label>
                {t("form.categoryName")}
                <input
                  name="name"
                  defaultValue={category?.name}
                  maxLength={30}
                  required
                  placeholder={t("form.categoryPh")}
                  autoFocus
                />
              </label>
              <label>
                {t("form.status")}
                <select
                  name="is_active"
                  defaultValue={
                    category?.is_active === false ? "false" : "true"
                  }
                >
                  <option value="true">{t("form.active")}</option>
                  <option value="false">{t("form.archived")}</option>
                </select>
              </label>
              <p className="form-hint">{t("form.archiveHint")}</p>
            </>
          )}
          {action.kind === "member" && (
            <>
              <label>
                {t("auth.email")}
                <input
                  name="email"
                  type="email"
                  maxLength={100}
                  placeholder={t("form.memberEmailPh")}
                  required
                  autoFocus
                />
              </label>
              <label>
                {t("form.householdRole")}
                <select name="role" defaultValue="Member">
                  <option value="Member">{ts("Member")}</option>
                  <option value="Admin">{ts("Admin")}</option>
                </select>
              </label>
              <p className="form-hint">{t("form.roleHint")}</p>
            </>
          )}
          {(action.kind === "family" || action.kind === "new-family") && (
            <label>
              {t("auth.household")}
              <input
                name="name"
                maxLength={50}
                defaultValue={action.kind === "family" ? family.name : ""}
                placeholder={t("form.householdPh")}
                required
                autoFocus
              />
            </label>
          )}
          {action.kind === "delete-expense" && (
            <p className="delete-message">
              {action.expense.note || ts(action.expense.category_name)} ·{" "}
              <strong>{money(action.expense.amount_kzt)}</strong>
              <br />
              {t("form.deleteExpenseText")}
            </p>
          )}
          {action.kind === "delete-income" && (
            <p className="delete-message">
              {action.income.source} ·{" "}
              <strong>{money(action.income.amount_kzt)}</strong>
              <br />
              {t("form.deleteIncomeText")}
            </p>
          )}
          {action.kind === "goal" && (
            <>
              <label>
                {t("form.goalName")}
                <input
                  name="name"
                  defaultValue={goal?.name}
                  maxLength={60}
                  placeholder={t("form.goalNamePh")}
                  required
                  autoFocus
                />
              </label>
              {amount(
                "target_kzt",
                t("form.goalTarget"),
                goal?.target_kzt,
                1000000000,
                { focus: false },
              )}
              {goal &&
                amount(
                  "saved_kzt",
                  t("form.goalSaved"),
                  goal.saved_kzt,
                  1000000000,
                  { min: 0, focus: false },
                )}
              <label>
                {t("form.goalDeadline")}{" "}
                <span className="muted">{t("form.optional")}</span>
                <input
                  name="deadline"
                  type="date"
                  min={
                    goal?.deadline && goal.deadline < today()
                      ? undefined
                      : today()
                  }
                  max="9998-12-31"
                  defaultValue={goal?.deadline ?? ""}
                />
              </label>
              <p className="form-hint">{t("form.goalHint")}</p>
            </>
          )}
          {action.kind === "contribute" && (
            <>
              {!action.goal && (
                <label>
                  {t("form.chooseGoal")}
                  <select
                    name="goal_id"
                    defaultValue={data.goals[0]?.id}
                    required
                  >
                    {data.goals.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {amount(
                "amount_kzt",
                t("form.contributeAmount"),
                undefined,
                10000000,
                {
                  focus: Boolean(action.goal),
                },
              )}
              <p className="form-hint">{t("form.goalHint")}</p>
            </>
          )}
          {action.kind === "request" && (
            <>
              {categorySelect(
                "category_id",
                t("form.category"),
                undefined,
                data.categories.filter((item) => item.is_active),
              )}
              {amount("amount_kzt", t("form.amount"), undefined, 10000000, {
                focus: false,
              })}
              <label>
                {t("form.requestNote")}
                <input
                  name="note"
                  maxLength={160}
                  placeholder={t("form.requestNotePh")}
                  required
                />
              </label>
              <p className="form-hint">
                {family.auto_approve_kzt
                  ? t("form.requestHintAuto", {
                      amount: money(family.auto_approve_kzt),
                    })
                  : t("form.requestHint")}
              </p>
            </>
          )}
          {action.kind === "reject-request" && (
            <label>
              {t("form.rejectReason")}{" "}
              <span className="muted">{t("form.optional")}</span>
              <input
                name="reason"
                maxLength={160}
                placeholder={t("form.rejectReasonPh")}
                autoFocus
              />
            </label>
          )}
          {action.kind === "reset-code" &&
            (resetCode ? (
              <div className="reset-code">
                <KeyRound size={20} />
                <code>{resetCode}</code>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("form.copyCode")}
                  title={t("form.copyCode")}
                  onClick={() => navigator.clipboard?.writeText(resetCode)}
                >
                  <Copy size={16} />
                </button>
                <p className="form-hint">{t("form.resetCodeHint")}</p>
              </div>
            ) : (
              <p className="form-hint">{t("form.resetCodeIntro")}</p>
            ))}
          {action.kind === "password" && (
            <>
              <label>
                {t("form.currentPassword")}
                <input
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  autoFocus
                />
              </label>
              <label>
                {t("form.newPassword")}
                <input
                  name="new_password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>
              <label>
                {t("form.repeatPassword")}
                <input
                  name="repeat_password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>
              <p className="form-hint">{t("form.passwordHint")}</p>
            </>
          )}
          {action.kind === "logout-all" && (
            <p className="delete-message">{t("form.logoutAllText")}</p>
          )}
          {action.kind === "delete-goal" && (
            <p className="delete-message">
              {action.goal.name} ·{" "}
              <strong>{money(action.goal.saved_kzt)}</strong>
              <br />
              {t("form.deleteGoalText")}
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
            {t(resetCode ? "common.done" : "common.cancel")}
          </button>
          {!resetCode && (
            <SubmitButton busy={busy}>
              {t(
                action.kind === "delete-goal"
                  ? "common.delete"
                  : action.kind === "goal"
                    ? "form.saveGoal"
                    : action.kind === "contribute"
                      ? "goals.contribute"
                      : action.kind.startsWith("delete")
                        ? "form.deleteEntry"
                        : action.kind === "expense"
                          ? "form.saveExpense"
                          : action.kind === "transfer"
                            ? "form.moveBudget"
                            : action.kind === "request"
                              ? "form.sendRequest"
                              : action.kind === "reject-request"
                                ? "requests.reject"
                                : action.kind === "reset-code"
                                  ? "form.issueCode"
                                  : action.kind === "logout-all"
                                    ? "form.logoutAll"
                                    : "common.saveChanges",
              )}
            </SubmitButton>
          )}
        </footer>
      </form>
    </Modal>
  );
}
