import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  ChevronDown,
  House,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api, dateLabel, initials, money } from "./api";
import { useI18n, LanguageSwitch, type Key } from "./i18n";
import { ThemeToggle } from "./theme";
import type { AppNotification, Family, Member, Session } from "./types";

export const navigation: { id: string; icon: LucideIcon }[] = [
  { id: "overview", icon: LayoutGrid },
  { id: "transactions", icon: ArrowRightLeft },
  { id: "budgets", icon: SlidersHorizontal },
  { id: "requests", icon: Inbox },
  { id: "goals", icon: Target },
  { id: "reports", icon: BarChart3 },
  { id: "household", icon: Users },
];

export function Sidebar({
  session,
  family,
  view,
  open,
  counts,
  navigate,
  onSwitchFamily,
  onLogout,
}: {
  session: Session;
  family: Family;
  view: string;
  open: boolean;
  counts: Record<string, number>;
  navigate: (view: string) => void;
  onSwitchFamily: (id: number) => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const firstName = session.user.full_name.split(" ")[0];
  return (
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <a className="brand" href="#overview">
        <span className="brand-mark">
          <House size={23} strokeWidth={1.7} />
        </span>
        <span>
          family<span className="brand-light">budget</span>
          <small>{t("brand.tagline")}</small>
        </span>
      </a>
      <div className="household-switcher">
        <div className="household-mini-icon">
          <House size={17} />
        </div>
        <div>
          <small>{t("app.yourHouseholdCaps")}</small>
          <select
            aria-label={t("app.switchHousehold")}
            value={family.id}
            onChange={(e) => onSwitchFamily(Number(e.target.value))}
          >
            {session.families.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <ChevronDown size={15} />
      </div>
      <span className="nav-label">{t("app.navLabel")}</span>
      <nav aria-label={t("app.mainNav")}>
        {navigation.map(({ id, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className={view === id ? "active" : ""}
            aria-current={view === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <Icon size={19} strokeWidth={1.7} />
            <span>{t(`nav.${id}` as Key)}</span>
            {counts[id] ? (
              <span className="nav-count" title={t(`count.${id}` as Key)}>
                {counts[id]}
              </span>
            ) : null}
          </a>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <span className="note-drawing" aria-hidden="true">
            <ArrowUpRight size={54} strokeWidth={1.4} />
          </span>
          <strong>
            {t("app.noteTitle1")}
            <br />
            {t("app.noteTitle2")}
          </strong>
          <p>
            {t("app.noteText1")}
            <br />
            {t("app.noteText2")}
          </p>
        </div>
        <div className="user-block">
          <span className="avatar">{initials(session.user.full_name)}</span>
          <div>
            <strong>{firstName}</strong>
            <small>
              {t(family.role === "Admin" ? "app.roleAdmin" : "app.roleMember")}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label={t("app.signOut")}
            title={t("app.signOut")}
            onClick={onLogout}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Where a notification leads when it is opened. */
const targets: Record<AppNotification["kind"], string> = {
  request_new: "requests",
  request_auto: "requests",
  request_approved: "requests",
  request_rejected: "requests",
  limit_warning: "budgets",
  limit_over: "budgets",
  goal_reached: "goals",
};

export function notificationText(
  item: AppNotification,
  t: ReturnType<typeof useI18n>["t"],
  ts: (text: string) => string,
) {
  const p = item.payload;
  const vars = {
    by: String(p.by ?? ""),
    note: String(p.note ?? ""),
    goal: String(p.goal ?? ""),
    category: ts(String(p.category ?? "")),
    amount: money(Number(p.amount ?? 0)),
    spent: money(Number(p.spent ?? 0)),
    limit: money(Number(p.limit ?? 0)),
    reason: String(p.reason ?? ""),
  };
  if (item.kind === "request_rejected" && !vars.reason)
    return t("notice.request_rejected_plain", vars);
  return t(`notice.${item.kind}` as Key, vars);
}

function NotificationBell({
  revision,
  familyId,
  navigate,
  onSwitchFamily,
}: {
  revision: number;
  familyId: number;
  navigate: (view: string) => void;
  onSwitchFamily: (id: number) => void;
}) {
  const { t, ts } = useI18n();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{
    unread: number;
    items: AppNotification[];
  }>({ unread: 0, items: [] });
  const [own, setOwn] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<typeof data>("/notifications", { signal: controller.signal })
      .then(setData)
      .catch(() => {
        /* Notifications are optional; the page keeps working without them. */
      });
    return () => controller.abort();
  }, [revision, own]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function markRead(ids?: number[]) {
    await api("/notifications/read", {
      method: "POST",
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => undefined);
    setOwn((value) => value + 1);
  }
  function openItem(item: AppNotification) {
    setOpen(false);
    if (!item.read) markRead([item.id]);
    if (item.family_id !== familyId) onSwitchFamily(item.family_id);
    navigate(targets[item.kind]);
  }
  return (
    <div className="bell" ref={box}>
      <button
        type="button"
        className="icon-button bell-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={
          data.unread
            ? t("notice.unreadLabel", { count: data.unread })
            : t("notice.title")
        }
        onClick={() => setOpen(!open)}
      >
        <Bell size={17} />
        {data.unread > 0 && (
          <span className="bell-badge">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="bell-panel"
          role="region"
          aria-label={t("notice.title")}
        >
          <div className="bell-head">
            <strong>{t("notice.title")}</strong>
            {data.unread > 0 && (
              <button className="text-button" onClick={() => markRead()}>
                {t("notice.readAll")}
              </button>
            )}
          </div>
          {data.items.length ? (
            <ul>
              {data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notice notice-${item.kind} ${item.read ? "" : "unread"}`}
                    onClick={() => openItem(item)}
                  >
                    <i aria-hidden="true" />
                    <span>
                      {notificationText(item, t, ts)}
                      <small>
                        {dateLabel(item.created_at)}
                        {item.family_id !== familyId
                          ? ` · ${item.family_name}`
                          : ""}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bell-empty">{t("notice.empty")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Topbar({
  title,
  members,
  familyId,
  revision,
  onMenu,
  onRefresh,
  navigate,
  onSwitchFamily,
}: {
  title: string;
  members: Member[];
  familyId: number;
  revision: number;
  onMenu: () => void;
  onRefresh: () => void;
  navigate: (view: string) => void;
  onSwitchFamily: (id: number) => void;
}) {
  const { t } = useI18n();
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <button
          className="icon-button mobile-toggle"
          aria-label={t("app.openNav")}
          onClick={onMenu}
        >
          <Menu size={20} />
        </button>
        <span>{t("app.breadcrumb")}</span>
        <span className="breadcrumb-slash">/</span>
        <strong>{title}</strong>
      </div>
      <div className="topbar-right">
        <span className="privacy-label">
          <ShieldCheck size={14} /> {t("app.privacy")}
        </span>
        <div className="avatar-stack">
          {members.slice(0, 3).map((member) => (
            <span
              className="avatar tiny"
              title={member.full_name}
              key={member.id}
            >
              {initials(member.full_name)}
            </span>
          ))}
        </div>
        <LanguageSwitch />
        <ThemeToggle />
        <NotificationBell
          revision={revision}
          familyId={familyId}
          navigate={navigate}
          onSwitchFamily={onSwitchFamily}
        />
        <button
          className="icon-button refresh-button"
          aria-label={t("app.refresh")}
          onClick={onRefresh}
        >
          <RefreshCw size={16} />
        </button>
      </div>
    </header>
  );
}
