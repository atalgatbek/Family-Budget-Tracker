import { useEffect } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  LayoutGrid,
  Minus,
  Plus,
  Target,
  ArrowRightLeft,
  X,
  type LucideIcon,
} from "lucide-react";
import { useI18n, type Key } from "./i18n";
import type { Action } from "./ActionModal";
import type { Family, Goal } from "./types";

type Item = {
  id: string;
  label: Key;
  icon: LucideIcon;
  tone: string;
  run: () => void;
};

/** The everyday actions, shared by the overview row and the phone sheet. */
export function quickActions({
  family,
  goals,
  onAction,
  navigate,
}: {
  family: Family;
  goals: Goal[];
  onAction: (action: Action) => void;
  navigate: (view: string) => void;
}): Item[] {
  const items: Item[] = [
    {
      id: "expense",
      label: "quick.expense",
      icon: Minus,
      tone: "critical",
      run: () => onAction({ kind: "expense" }),
    },
    {
      id: "income",
      label: "quick.income",
      icon: Plus,
      tone: "good",
      run: () => onAction({ kind: "income" }),
    },
    {
      id: "goal",
      label: "quick.goal",
      icon: Target,
      tone: "accent",
      // With no goals yet, take the person to the page where goals are made.
      run: () =>
        goals.length ? onAction({ kind: "contribute" }) : navigate("goals"),
    },
  ];
  if (family.role === "Admin")
    items.push({
      id: "transfer",
      label: "quick.transfer",
      icon: ArrowLeftRight,
      tone: "warning",
      run: () => onAction({ kind: "transfer" }),
    });
  return items;
}

export function QuickActions({ items }: { items: Item[] }) {
  const { t } = useI18n();
  return (
    <section className="quick-actions" aria-label={t("quick.aria")}>
      {items.map(({ id, label, icon: Icon, tone, run }) => (
        <button type="button" key={id} className="quick-action" onClick={run}>
          <span className={`quick-icon ${tone}`}>
            <Icon size={17} strokeWidth={2.2} />
          </span>
          {t(label)}
        </button>
      ))}
    </section>
  );
}

const tabs = [
  { id: "overview", icon: LayoutGrid },
  { id: "transactions", icon: ArrowRightLeft },
  { id: "goals", icon: Target },
  { id: "reports", icon: BarChart3 },
];

/** Phone navigation: four pages and a large add button in the middle. */
export function TabBar({
  view,
  navigate,
  onAdd,
}: {
  view: string;
  navigate: (view: string) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const link = ({ id, icon: Icon }: (typeof tabs)[number]) => (
    <a
      key={id}
      href={`#${id}`}
      className={view === id ? "active" : ""}
      aria-current={view === id ? "page" : undefined}
      onClick={() => navigate(id)}
    >
      <Icon size={20} strokeWidth={1.8} />
      <span>{t(`nav.${id}` as Key)}</span>
    </a>
  );
  return (
    <nav className="tab-bar" aria-label={t("app.mainNav")}>
      {tabs.slice(0, 2).map(link)}
      <button
        type="button"
        className="tab-add"
        aria-label={t("quick.add")}
        onClick={onAdd}
      >
        <Plus size={26} strokeWidth={2.2} />
      </button>
      {tabs.slice(2).map(link)}
    </nav>
  );
}

/** Sheet that slides up from the bottom on phones with the quick actions. */
export function ActionSheet({
  items,
  onClose,
}: {
  items: Item[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  return (
    <div className="sheet-layer">
      <button
        type="button"
        className="sheet-backdrop"
        aria-label={t("modal.close")}
        onClick={onClose}
      />
      <div
        className="action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("quick.sheet")}
      >
        <div className="sheet-head">
          <strong>{t("quick.sheet")}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label={t("modal.close")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {items.map(({ id, label, icon: Icon, tone, run }) => (
          <button
            type="button"
            key={id}
            className="sheet-item"
            autoFocus={id === "expense"}
            onClick={() => {
              onClose();
              run();
            }}
          >
            <span className={`quick-icon ${tone}`}>
              <Icon size={17} strokeWidth={2.2} />
            </span>
            {t(`${label}Long` as Key)}
          </button>
        ))}
      </div>
    </div>
  );
}
