import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  BarChart3,
  Check,
  ChevronDown,
  House,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { api, initials, messageOf, monthName, today } from "./api";
import { ErrorNotice, Loading, MonthPicker } from "./components";
import AuthPage from "./AuthPage";
import ActionModal, { type Action } from "./ActionModal";
import Overview from "./Overview";
import Transactions from "./Transactions";
import Budgets from "./Budgets";
import Reports from "./Reports";
import Household from "./Household";
import type {
  Category,
  ExpensePage,
  Income,
  Member,
  Session,
  Summary,
  Workspace,
} from "./types";

const navigation = [
  { id: "overview", title: "Overview", icon: LayoutGrid },
  { id: "transactions", title: "Transactions", icon: ArrowRightLeft },
  { id: "budgets", title: "Budgets", icon: SlidersHorizontal },
  { id: "reports", title: "Reports", icon: BarChart3 },
  { id: "household", title: "Household", icon: Users },
];
const getView = () =>
  navigation.some((item) => item.id === location.hash.slice(1))
    ? location.hash.slice(1)
    : "overview";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [view, setView] = useState(getView);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [data, setData] = useState<(Workspace & { key: string }) | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [toast, setToast] = useState("");
  const family = session?.families.find((item) => item.id === familyId);
  const key = `${familyId}:${month}`;
  const workspace = data?.key === key ? data : null;
  const onLogin = useCallback((value: Session) => {
    setSession(value);
    setFamilyId(value.families[0]?.id ?? null);
    setMonth(value.families[0]?.latest_budget_month ?? today().slice(0, 7));
    setBootError("");
    setData(null);
  }, []);
  const boot = useCallback(() => {
    setBooting(true);
    setBootError("");
    api<Session>("/auth/me")
      .then(onLogin)
      .catch((error) => {
        if (error.status !== 401) setBootError(messageOf(error));
      })
      .finally(() => setBooting(false));
  }, [onLogin]);
  useEffect(boot, [boot]);
  useEffect(() => {
    const handler = () => {
      setView(getView());
      setMobileMenu(false);
    };
    window.addEventListener("hashchange", handler);
    const expired = () => {
      setSession(null);
      setData(null);
      setAction(null);
    };
    window.addEventListener("session-expired", expired);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  useEffect(() => {
    if (!familyId || !session) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const base = `/families/${familyId}`;
    Promise.all([
      api<Summary>(`${base}/summary?month=${month}`, options),
      api<ExpensePage>(`${base}/expenses?month=${month}&page_size=5`, options),
      api<Category[]>(`${base}/categories`, options),
      api<Member[]>(`${base}/members`, options),
      api<Income[]>(`${base}/income?month=${month}`, options),
    ])
      .then(([summary, recent, categories, members, income]) => {
        setData({ summary, recent, categories, members, income, key });
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(messageOf(error));
      });
    return () => controller.abort();
  }, [familyId, month, revision, key, session]);
  useEffect(() => {
    if (!session) return;
    const update = () => {
      if (document.visibilityState === "visible")
        setRevision((value) => value + 1);
    };
    const interval = window.setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, [session]);
  useEffect(() => {
    if (toast) {
      const timeout = window.setTimeout(() => setToast(""), 6500);
      return () => clearTimeout(timeout);
    }
  }, [toast]);
  function navigate(id: string) {
    location.hash = id;
    setView(id);
    setMobileMenu(false);
  }
  async function saved(message: string, targetMonth?: string) {
    setAction(null);
    setToast(message);
    if (targetMonth) setMonth(targetMonth);
    setRevision((value) => value + 1);
    try {
      setSession(await api<Session>("/auth/me"));
    } catch (error) {
      setError(messageOf(error));
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setSession(null);
      setData(null);
      setAction(null);
    } catch (error) {
      setError(messageOf(error));
    }
  }
  if (booting)
    return (
      <div className="boot-screen">
        <Loading />
      </div>
    );
  if (bootError)
    return (
      <div className="boot-screen">
        <div className="connection-error">
          <House size={32} />
          <h1>Let’s get connected.</h1>
          <p>
            We couldn’t reach your household. Check the connection and try
            again.
          </p>
          <ErrorNotice message={bootError} retry={boot} />
        </div>
      </div>
    );
  if (!session) return <AuthPage onLogin={onLogin} />;
  if (!family)
    return (
      <div className="boot-screen">
        <ErrorNotice message="No household is available for this account." />
        <button className="button secondary" onClick={logout}>
          Sign out
        </button>
      </div>
    );
  const titles: Record<string, { heading: string; subheading: string }> = {
    overview: {
      heading: `A little more in balance.`,
      subheading: `Here’s how ${family.name} is doing this month.`,
    },
    transactions: {
      heading: "The everyday, accounted for.",
      subheading: "A home for every purchase and every payday.",
    },
    budgets: {
      heading: "A plan you can live with.",
      subheading: "Give your money a purpose. Leave a little room for life.",
    },
    reports: {
      heading: "See the bigger picture.",
      subheading: "Your month in numbers, with room to reflect.",
    },
    household: {
      heading: "Better, together.",
      subheading:
        "The people, categories, and little details of your shared budget.",
    },
  };
  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "is-open" : ""}`}>
        <a className="brand" href="#overview">
          <span className="brand-mark">
            <House size={23} strokeWidth={1.7} />
          </span>
          <span>
            family<span className="brand-light">budget</span>
            <small>A LITTLE MORE IN BALANCE</small>
          </span>
        </a>
        <div className="household-switcher">
          <div className="household-mini-icon">
            <House size={17} />
          </div>
          <div>
            <small>YOUR HOUSEHOLD</small>
            <select
              aria-label="Switch household"
              value={familyId ?? ""}
              onChange={(e) => {
                const selected = session.families.find(
                  (f) => f.id === Number(e.target.value),
                )!;
                setFamilyId(selected.id);
                setMonth(selected.latest_budget_month ?? today().slice(0, 7));
                setAction(null);
                setError("");
              }}
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
        <span className="nav-label">YOUR MONEY, TOGETHER</span>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, title, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{title}</span>
              {id === "transactions" && workspace?.summary.review_count ? (
                <span
                  className="nav-count"
                  title="Household entries needing review"
                >
                  {workspace.summary.review_count}
                </span>
              ) : null}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-drawing" aria-hidden="true">
              ↗
            </span>
            <strong>
              Little steps.
              <br />
              Shared progress.
            </strong>
            <p>
              A good plan starts with
              <br />
              being on the same page.
            </p>
          </div>
          <div className="user-block">
            <span className="avatar">{initials(session.user.full_name)}</span>
            <div>
              <strong>{session.user.full_name.split(" ")[0]}</strong>
              <small>
                {family.role === "Admin"
                  ? "Household admin"
                  : "Household member"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>Your household</span>
            <span className="breadcrumb-slash">/</span>
            <strong>
              {navigation.find((item) => item.id === view)?.title}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="privacy-label">
              <ShieldCheck size={14} /> Just your family
            </span>
            <div className="avatar-stack">
              {workspace?.members.slice(0, 3).map((member) => (
                <span
                  className="avatar tiny"
                  title={member.full_name}
                  key={member.id}
                >
                  {initials(member.full_name)}
                </span>
              ))}
            </div>
            <button
              className="icon-button refresh-button"
              aria-label="Refresh household data"
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {view === "overview"
                  ? `HELLO, ${session.user.full_name.split(" ")[0].toUpperCase()}`
                  : navigation
                      .find((item) => item.id === view)
                      ?.title.toUpperCase()}
              </span>
              <h1>{titles[view].heading}</h1>
              <p>{titles[view].subheading}</p>
            </div>
            <div className="heading-actions">
              {view !== "household" && (
                <MonthPicker
                  month={month}
                  onChange={(value) => {
                    setMonth(value);
                    setError("");
                  }}
                />
              )}
              {(view === "overview" || view === "transactions") && (
                <button
                  className="button primary"
                  onClick={() => setAction({ kind: "expense" })}
                  disabled={!workspace}
                >
                  <Plus size={18} /> Add expense
                </button>
              )}
            </div>
          </div>
          {error && (
            <ErrorNotice
              message={error}
              retry={() => setRevision((value) => value + 1)}
            />
          )}
          {workspace ? (
            <>
              <div className="mobile-period">
                {view !== "household" && monthName(month)}
              </div>
              {view === "overview" && (
                <Overview
                  data={workspace}
                  family={family}
                  month={month}
                  onAction={setAction}
                  navigate={navigate}
                />
              )}
              {view === "transactions" && (
                <Transactions
                  key={key}
                  family={family}
                  month={month}
                  revision={revision}
                  data={workspace}
                  onAction={setAction}
                />
              )}
              {view === "budgets" && (
                <Budgets
                  family={family}
                  month={month}
                  revision={revision}
                  data={workspace}
                  onAction={setAction}
                />
              )}
              {view === "reports" && <Reports summary={workspace.summary} />}
              {view === "household" && (
                <Household
                  family={family}
                  data={workspace}
                  user={session.user}
                  onAction={setAction}
                />
              )}
            </>
          ) : (
            !error && <Loading />
          )}
          <footer className="page-footer">
            <span>A little clarity for the life you share.</span>
            <span>
              <span className="connection-dot" />
              {error
                ? "Connection needs attention"
                : "Shared with your household"}{" "}
              · KZT
            </span>
          </footer>
        </main>
      </div>
      {action && workspace && (
        <ActionModal
          action={action}
          family={family}
          month={month}
          data={workspace}
          onClose={() => setAction(null)}
          onSaved={saved}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
