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
import type { BudgetCategory } from "./types";

export const categoryStyle = (
  name: string,
): { icon: LucideIcon; color: string; background: string } => {
  const key = name.toLowerCase();
  if (key.includes("food") || key.includes("grocer"))
    return { icon: ShoppingBasket, color: "#59744a", background: "#eef1e7" };
  if (key.includes("transport"))
    return { icon: BusFront, color: "#b38443", background: "#f7efe1" };
  if (key.includes("utilit"))
    return { icon: Zap, color: "#7b7eab", background: "#eeeeF7" };
  if (key.includes("child") || key.includes("kid"))
    return { icon: Baby, color: "#b37769", background: "#f8eee9" };
  if (key.includes("entertain"))
    return { icon: Clapperboard, color: "#5e8c8b", background: "#eaf2f1" };
  return { icon: Home, color: "#788274", background: "#edf0eb" };
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
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          Try again
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
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      <span>Getting everything in order…</span>
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
        aria-label="Previous month"
        onClick={() => move(-1)}
      >
        <ChevronLeft size={17} />
      </button>
      <label>
        <span>{monthName(month)}</span>
        <input
          type="month"
          aria-label="Budget month"
          value={month}
          min="1900-01"
          max="9998-12"
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </label>
      <button
        className="icon-button"
        aria-label="Next month"
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
            aria-label="Close dialog"
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
  children = "Save changes",
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
      {busy ? "Saving…" : children}
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
  const { color } = categoryStyle(category.name);
  const warning = (category.used_percent ?? 0) >= 85;
  return (
    <div className="budget-row">
      <div className="budget-row-top">
        <div className="category-name">
          <CategoryIcon name={category.name} />
          <div>
            <strong>{category.name}</strong>
            <span>
              {money(category.spent_kzt)}{" "}
              <span className="muted">
                of {category.limit_kzt ? money(category.limit_kzt) : "no limit"}
              </span>
            </span>
          </div>
        </div>
        <div className={`budget-left ${warning ? "warning-text" : ""}`}>
          <strong>
            {category.left_kzt === null
              ? "No limit"
              : money(Math.abs(category.left_kzt))}
          </strong>
          <span>
            {category.left_kzt !== null && category.left_kzt < 0
              ? "over budget"
              : "left to spend"}
          </span>
        </div>
      </div>
      <div className="progress-track">
        <div
          style={{
            width: `${Math.min(category.used_percent || 0, 100)}%`,
            background: warning ? "#c2964d" : color,
          }}
        />
      </div>
      {onClick && (
        <button className="text-button budget-edit" onClick={onClick}>
          Adjust limit <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
