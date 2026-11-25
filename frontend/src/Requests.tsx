import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  Inbox,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { api, dateLabel, messageOf, money } from "./api";
import { CategoryIcon, Empty, ErrorNotice } from "./components";
import { useI18n } from "./i18n";
import { StatusPill } from "./Status";
import type { Action } from "./ActionModal";
import type { Family, PurchaseRequest, User, Workspace } from "./types";

function RequestCard({
  row,
  admin,
  own,
  busy,
  onApprove,
  onReject,
  onCancel,
}: {
  row: PurchaseRequest;
  admin: boolean;
  own: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const { t, ts } = useI18n();
  const pending = row.status === "pending";
  return (
    <article className={`request-card ${row.status}`}>
      <div className="request-main">
        <CategoryIcon name={row.category_name} />
        <div>
          <strong>{row.note}</strong>
          <small>
            {ts(row.category_name)} · {admin ? `${row.user_name} · ` : ""}
            {dateLabel(row.created_at)}
          </small>
        </div>
        <b className="request-amount">{money(row.amount_kzt)}</b>
      </div>
      {pending && row.over_limit && (
        <p className="request-warning">
          <AlertTriangle size={14} />
          {t("requests.overLimit", {
            left: money(Math.max(row.left_kzt ?? 0, 0)),
          })}
        </p>
      )}
      {pending && !row.over_limit && row.left_kzt !== null && (
        <p className="request-ok">
          <Check size={14} />
          {t("requests.fits", { left: money(row.left_kzt) })}
        </p>
      )}
      {!pending && (
        <p className="request-decision">
          {row.status === "approved" && row.auto && (
            <>
              <Zap size={14} /> {t("requests.decidedAuto")}
            </>
          )}
          {row.status === "approved" && !row.auto && (
            <>
              <Check size={14} />{" "}
              {t("requests.decidedBy", { name: row.decided_by_name ?? "" })}
            </>
          )}
          {row.status === "rejected" && (
            <>
              <X size={14} />{" "}
              {row.reason
                ? t("requests.rejectedReason", { reason: row.reason })
                : t("requests.rejectedBy", { name: row.decided_by_name ?? "" })}
            </>
          )}
          {row.status === "cancelled" && (
            <>
              <X size={14} /> {t("requests.cancelledNote")}
            </>
          )}
        </p>
      )}
      <div className="request-foot">
        <StatusPill
          level={
            row.status === "approved"
              ? "good"
              : row.status === "pending"
                ? "warning"
                : "critical"
          }
        >
          {t(`requests.status.${row.status}`)}
        </StatusPill>
        {pending && admin && (
          <span className="request-actions">
            <button
              className="button secondary small-button"
              disabled={busy}
              onClick={onReject}
            >
              <X size={15} /> {t("requests.reject")}
            </button>
            <button
              className="button primary small-button"
              disabled={busy}
              onClick={onApprove}
            >
              <Check size={15} /> {t("requests.approve")}
            </button>
          </span>
        )}
        {pending && !admin && own && (
          <button className="text-button" disabled={busy} onClick={onCancel}>
            {t("requests.cancel")}
          </button>
        )}
      </div>
    </article>
  );
}

function RulesPanel({
  family,
  onChanged,
}: {
  family: Family;
  onChanged: (message: string) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(family.auto_approve_kzt !== null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("auto_approve_kzt");
    setBusy(true);
    setError("");
    try {
      await api(`/families/${family.id}/request-rules`, {
        method: "PUT",
        body: JSON.stringify({
          auto_approve_kzt: enabled ? Number(value) : null,
        }),
      });
      onChanged(t("toast.rulesSaved"));
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel rules-panel" onSubmit={submit}>
      <div className="rules-text">
        <span className="quick-icon accent">
          <Sparkles size={17} />
        </span>
        <div>
          <strong>{t("requests.rulesTitle")}</strong>
          <p>{t("requests.rulesText")}</p>
        </div>
      </div>
      <div className="rules-form">
        <label className="rules-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {t("requests.rulesEnable")}
        </label>
        <div className="amount-field">
          <span>₸</span>
          <input
            name="auto_approve_kzt"
            type="number"
            min="1"
            max="10000000"
            step="1"
            inputMode="numeric"
            aria-label={t("requests.rulesAmount")}
            defaultValue={family.auto_approve_kzt ?? 5000}
            disabled={!enabled}
            required={enabled}
          />
        </div>
        <button className="button secondary" disabled={busy}>
          {t("common.saveChanges")}
        </button>
      </div>
      {error && <ErrorNotice message={error} />}
    </form>
  );
}

export default function Requests({
  data,
  family,
  user,
  onAction,
  onChanged,
}: {
  data: Workspace;
  family: Family;
  user: User;
  onAction: (action: Action) => void;
  onChanged: (message: string) => void;
}) {
  const { t } = useI18n();
  const admin = family.role === "Admin";
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const pending = data.requests.filter((row) => row.status === "pending");
  const history = data.requests.filter((row) => row.status !== "pending");
  async function act(row: PurchaseRequest, path: string, method = "POST") {
    setBusy(row.id);
    setError("");
    try {
      await api(`/families/${family.id}/requests/${row.id}${path}`, {
        method,
        body: method === "POST" ? "{}" : undefined,
      });
      onChanged(
        t(
          path === "/approve"
            ? "toast.requestApproved"
            : "toast.requestCancelled",
        ),
      );
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(0);
    }
  }
  const card = (row: PurchaseRequest) => (
    <RequestCard
      key={row.id}
      row={row}
      admin={admin}
      own={row.user_id === user.id}
      busy={busy === row.id}
      onApprove={() => act(row, "/approve")}
      onReject={() => onAction({ kind: "reject-request", request: row })}
      onCancel={() => act(row, "", "DELETE")}
    />
  );
  return (
    <>
      <p className="page-lead">
        {t(admin ? "requests.introAdmin" : "requests.introMember")}
      </p>
      {admin && <RulesPanel family={family} onChanged={onChanged} />}
      {error && <ErrorNotice message={error} />}
      <section className="request-section">
        <h2>
          <Clock3 size={17} />{" "}
          {t(admin ? "requests.waiting" : "requests.myWaiting")}
          <span className="section-count">{pending.length}</span>
        </h2>
        {pending.length ? (
          <div className="request-grid">{pending.map(card)}</div>
        ) : (
          <div className="panel">
            <Empty title={t("requests.noneWaiting")}>
              {t(
                admin
                  ? "requests.noneWaitingAdmin"
                  : "requests.noneWaitingMember",
              )}
            </Empty>
          </div>
        )}
      </section>
      {history.length > 0 && (
        <section className="request-section">
          <h2>
            <Inbox size={17} /> {t("requests.history")}
          </h2>
          <div className="request-grid">{history.map(card)}</div>
        </section>
      )}
    </>
  );
}
