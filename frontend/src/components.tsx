import { useEffect, useRef, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Baby,
  BusFront,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Home,
  LoaderCircle,
  ShoppingBasket,
  Sparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { money, monthName } from "./api";
import { useI18n } from "./i18n";
import { StatusPill, categoryLevel } from "./Status";
import type { BudgetCategory } from "./types";

export const categoryStyle = (
  name: string,
): { icon: LucideIcon; color: string; background: string } => {
  const key = name.toLowerCase();
  const has = (...parts: string[]) => parts.some((part) => key.includes(part));
  if (has("food", "grocer", "еда", "продукт", "тамақ", "азық"))
    return {
      icon: ShoppingBasket,
      color: "var(--cat-food)",
      background: "var(--cat-food-bg)",
    };
  if (has("transport", "транспорт", "көлік"))
    return {
      icon: BusFront,
      color: "var(--cat-transport)",
      background: "var(--cat-transport-bg)",
    };
  if (has("utilit", "коммун"))
    return {
      icon: Zap,
      color: "var(--cat-utilities)",
      background: "var(--cat-utilities-bg)",
    };
  if (has("child", "kid", "дет", "бала"))
    return {
      icon: Baby,
      color: "var(--cat-children)",
      background: "var(--cat-children-bg)",
    };
  if (has("entertain", "развлеч", "ойын"))
    return {
      icon: Clapperboard,
      color: "var(--cat-fun)",
      background: "var(--cat-fun-bg)",
    };
  return {
    icon: Home,
    color: "var(--cat-other)",
    background: "var(--cat-other-bg)",
  };
};

export function CategoryIcon({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  const { icon: Icon, color, background } = categoryStyle(name);
  return (
    <span
      className={`category-icon ${small ? "small" : ""}`}
      style={{ color, background }}
    >
      <Icon size={small ? 17 : 20} strokeWidth={1.7} />
    </span>
  );
}

export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const { t, ts } = useI18n();
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={18} />
      <span>{ts(message)}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          {t("common.tryAgain")}
        </button>
      )}
    </div>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">
        <Sparkles size={24} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      <span>{t("common.loading")}</span>
    </div>
  );
}

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  function move(step: number) {
    const date = new Date(`${month}-01T12:00:00`);
    date.setMonth(date.getMonth() + step);
    onChange(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return (
    <div className="month-picker">
      <button
        className="icon-button"
        aria-label={t("month.prev")}
        onClick={() => move(-1)}
      >
        <ChevronLeft size={17} />
      </button>
      <label>
        <span>{monthName(month)}</span>
        <input
          type="month"
          aria-label={t("month.label")}
          value={month}
          min="1900-01"
          max="9998-12"
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </label>
      <button
        className="icon-button"
        aria-label={t("month.next")}
        onClick={() => move(1)}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="modal-inner">
        <header>
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t("modal.close")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function SubmitButton({
  busy,
  children,
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
      {busy ? t("common.saving") : (children ?? t("common.saveChanges"))}
    </button>
  );
}

export function BudgetRow({
  category,
  onClick,
}: {
  category: BudgetCategory;
  onClick?: () => void;
}) {
  const { t, ts } = useI18n();
  const { color } = categoryStyle(category.name);
  const warning = (category.used_percent ?? 0) >= 85;
  const level = categoryLevel(category);
  return (
    <div className="budget-row">
      <div className="budget-row-top">
        <div className="category-name">
          <CategoryIcon name={category.name} />
          <div>
            <strong>
              {ts(category.name)}
              {level && level !== "good" && <StatusPill level={level} />}
            </strong>
            <span>
              {money(category.spent_kzt)}{" "}
              <span className="muted">
                {category.limit_kzt
                  ? t("budget.ofLimit", { limit: money(category.limit_kzt) })
                  : t("budget.ofNoLimit")}
              </span>
            </span>
          </div>
        </div>
        <div className={`budget-left ${warning ? "warning-text" : ""}`}>
          <strong>
            {category.left_kzt === null
              ? t("budget.noLimit")
              : money(Math.abs(category.left_kzt))}
          </strong>
          <span>
            {t(
              category.left_kzt !== null && category.left_kzt < 0
                ? "budget.over"
                : "budget.left",
            )}
          </span>
        </div>
      </div>
      <div className="progress-track">
        <div
          style={{
            width: `${Math.min(category.used_percent || 0, 100)}%`,
            background:
              level === "critical"
                ? "var(--status-critical)"
                : warning
                  ? "var(--status-warning)"
                  : color,
          }}
        />
      </div>
      {onClick && (
        <button className="text-button budget-edit" onClick={onClick}>
          {t("budget.adjust")} <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
