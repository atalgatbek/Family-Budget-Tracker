import { useState, type FormEvent } from "react";
import {
  ArrowRight,
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

export default function AuthPage({
  onLogin,
}: {
  onLogin: (session: Session) => void;
}) {
  const { t } = useI18n();
  const [register, setRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
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
              <span>↗</span>
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
          <h2>{t(register ? "auth.registerTitle" : "auth.loginTitle")}</h2>
          <p>{t(register ? "auth.registerSub" : "auth.loginSub")}</p>
          <form onSubmit={submit}>
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
                required
              />
            </label>
            <label>
              {t("auth.password")}
              <div className="password-field">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  minLength={register ? 8 : 1}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
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
            {error && <ErrorNotice message={error} />}
            <button className="button primary auth-submit" disabled={busy}>
              {t(busy ? "auth.wait" : register ? "auth.create" : "auth.signIn")}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {t(register ? "auth.already" : "auth.newHere")}{" "}
            <button
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {t(register ? "auth.signIn" : "auth.createAccount")}
            </button>
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
