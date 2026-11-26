import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Eye,
  EyeOff,
  House,
  LockKeyhole,
  Users,
} from "lucide-react";
import { api, messageOf } from "./api";
import { ErrorNotice } from "./components";
import { ThemeToggle } from "./theme";
import { LanguageSwitch, useI18n } from "./i18n";
import type { Session } from "./types";

type Mode = "login" | "register" | "forgot" | "reset";

/** A link from the reset email opens the page with ?reset=CODE&email=... */
function resetLink() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("reset");
  if (!code) return null;
  // Keep the code out of the address bar and the browser history.
  window.history.replaceState(null, "", window.location.pathname);
  return { code, email: params.get("email") ?? "" };
}

export default function AuthPage({
  onLogin,
  expired = false,
}: {
  onLogin: (session: Session) => void;
  expired?: boolean;
}) {
  const { lang, t } = useI18n();
  const [link] = useState(resetLink);
  const [mode, setMode] = useState<Mode>(link ? "reset" : "login");
  const register = mode === "register";
  const [email, setEmail] = useState(link?.email ?? "");
  const [notice, setNotice] = useState(
    link ? t("auth.fromLink") : expired ? t("auth.expired") : "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "forgot") {
        await api("/auth/forgot", {
          method: "POST",
          body: JSON.stringify({ email: values.email, lang }),
        });
        setEmail(String(values.email));
        switchMode("reset");
        setNotice(t("auth.codeSent"));
        return;
      }
      if (mode === "reset") {
        if (values.new_password !== values.repeat_password)
          throw new Error(t("form.passwordsDiffer"));
        await api("/auth/reset", {
          method: "POST",
          body: JSON.stringify({
            email: values.email,
            code: values.code,
            new_password: values.new_password,
          }),
        });
        setEmail(String(values.email));
        switchMode("login");
        setNotice(t("auth.resetDone"));
        return;
      }
      onLogin(
        await api<Session>(`/auth/${register ? "register" : "login"}`, {
          method: "POST",
          body: JSON.stringify(values),
        }),
      );
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
  }
  const title = {
    login: "auth.loginTitle",
    register: "auth.registerTitle",
    forgot: "auth.forgotTitle",
    reset: "auth.resetTitle",
  } as const;
  const subtitle = {
    login: "auth.loginSub",
    register: "auth.registerSub",
    forgot: "auth.forgotSub",
    reset: "auth.resetSub",
  } as const;
  return (
    <main className="auth-layout">
      <div className="floating-controls">
        <LanguageSwitch />
        <ThemeToggle />
      </div>
      <section className="auth-story">
        <a className="brand" href="#">
          <span className="brand-mark">
            <House size={24} strokeWidth={1.7} />
          </span>
          <span>
            family<span className="brand-light">budget</span>
            <small>{t("brand.tagline")}</small>
          </span>
        </a>
        <div className="auth-story-main">
          <span className="eyebrow">{t("auth.eyebrow")}</span>
          <h1>
            {t("auth.h1a")}
            <br />
            <em>{t("auth.h1b")}</em>
          </h1>
          <p>
            {t("auth.p1")}
            <br />
            {t("auth.p2")}
          </p>
          <div className="paper-illustration" aria-hidden="true">
            <div className="paper-tab" />
            <span>{t("auth.paperTitle")}</span>
            <div className="paper-line">
              <span>{t("auth.paper1")}</span>
              <span>✓</span>
            </div>
            <div className="paper-line">
              <span>{t("auth.paper2")}</span>
              <span>✓</span>
            </div>
            <div className="paper-line">
              <span>{t("auth.paper3")}</span>
              <span>✓</span>
            </div>
            <div className="paper-bottom">
              {t("auth.paperBottom")}
              <span>
                <ArrowUpRight size={24} strokeWidth={1.6} />
              </span>
            </div>
          </div>
        </div>
        <div className="auth-footer">
          <span>
            <Users size={15} /> {t("auth.made")}
          </span>
          <span>
            <LockKeyhole size={14} /> {t("auth.private")}
          </span>
        </div>
      </section>
      <section className="auth-form-area">
        <div className="auth-form-wrap">
          <span className="small-logo">
            <ChartNoAxesCombined size={25} />
          </span>
          <h2>{t(title[mode])}</h2>
          <p>{t(subtitle[mode])}</p>
          {notice && (
            <div className="auth-notice" role="status">
              <LockKeyhole size={15} />
              <span>{notice}</span>
            </div>
          )}
          <form onSubmit={submit} key={mode}>
            {register && (
              <>
                <label>
                  {t("auth.name")}
                  <input
                    name="full_name"
                    autoComplete="name"
                    maxLength={60}
                    placeholder={t("auth.namePh")}
                    required
                  />
                </label>
                <label>
                  {t("auth.household")}
                  <input
                    name="family_name"
                    maxLength={50}
                    placeholder={t("auth.householdPh")}
                    required
                  />
                </label>
              </>
            )}
            <label>
              {t("auth.email")}
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={100}
                placeholder="you@example.com"
                defaultValue={email}
                required
              />
            </label>
            {mode === "reset" && (
              <>
                <label>
                  {t("auth.resetCode")}
                  <input
                    name="code"
                    autoComplete="one-time-code"
                    maxLength={20}
                    placeholder="ABCD-2345"
                    className="code-input"
                    defaultValue={link?.code ?? ""}
                    required
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
                    placeholder={t("auth.pwPhRegister")}
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
              </>
            )}
            {(mode === "login" || mode === "register") && (
              <label>
                {t("auth.password")}
                <div className="password-field">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    minLength={register ? 8 : 1}
                    maxLength={128}
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    placeholder={t(
                      register ? "auth.pwPhRegister" : "auth.pwPhLogin",
                    )}
                    required
                  />
                  <button
                    type="button"
                    aria-label={t(
                      showPassword ? "auth.hidePassword" : "auth.showPassword",
                    )}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
            )}
            {mode === "login" && (
              <button
                type="button"
                className="text-button forgot-link"
                onClick={() => switchMode("forgot")}
              >
                {t("auth.forgot")}
              </button>
            )}
            {error && <ErrorNotice message={error} />}
            <button className="button primary auth-submit" disabled={busy}>
              {t(
                busy
                  ? "auth.wait"
                  : (
                      {
                        login: "auth.signIn",
                        register: "auth.create",
                        forgot: "auth.sendCode",
                        reset: "auth.resetSubmit",
                      } as const
                    )[mode],
              )}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "forgot" || mode === "reset" ? (
              <span className="auth-links">
                <button
                  className="text-button"
                  onClick={() =>
                    switchMode(mode === "forgot" ? "reset" : "forgot")
                  }
                >
                  {t(mode === "forgot" ? "auth.haveCode" : "auth.resendCode")}
                </button>
                <button
                  className="text-button"
                  onClick={() => switchMode("login")}
                >
                  {t("auth.backToSignIn")}
                </button>
              </span>
            ) : (
              <>
                {t(register ? "auth.already" : "auth.newHere")}{" "}
                <button
                  className="text-button"
                  onClick={() => switchMode(register ? "login" : "register")}
                >
                  {t(register ? "auth.signIn" : "auth.createAccount")}
                </button>
              </>
            )}
          </p>
          <div className="auth-note">
            <LockKeyhole size={15} />
            <span>{t("auth.note")}</span>
          </div>
        </div>
        <span className="auth-copyright">{t("auth.copyright")}</span>
      </section>
    </main>
  );
}
