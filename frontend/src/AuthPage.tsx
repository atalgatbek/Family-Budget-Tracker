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
import type { Session } from "./types";

export default function AuthPage({
  onLogin,
}: {
  onLogin: (session: Session) => void;
}) {
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
      <section className="auth-story">
        <a className="brand" href="#">
          <span className="brand-mark">
            <House size={24} strokeWidth={1.7} />
          </span>
          <span>
            family<span className="brand-light">budget</span>
            <small>A LITTLE MORE IN BALANCE</small>
          </span>
        </a>
        <div className="auth-story-main">
          <span className="eyebrow">FOR THE LIFE YOU SHARE</span>
          <h1>
            Good with money.
            <br />
            <em>Better together.</em>
          </h1>
          <p>
            Every grocery run. Every little plan.
            <br />
            One place to keep your family’s money in view.
          </p>
          <div className="paper-illustration" aria-hidden="true">
            <div className="paper-tab" />
            <span>THE LITTLE THINGS ADD UP</span>
            <div className="paper-line">
              <span>Room for the everyday</span>
              <span>✓</span>
            </div>
            <div className="paper-line">
              <span>Something for the unexpected</span>
              <span>✓</span>
            </div>
            <div className="paper-line">
              <span>A little for what’s next</span>
              <span>✓</span>
            </div>
            <div className="paper-bottom">
              A plan we can all be part of.<span>↗</span>
            </div>
          </div>
        </div>
        <div className="auth-footer">
          <span>
            <Users size={15} /> Made for your household
          </span>
          <span>
            <LockKeyhole size={14} /> Private by design
          </span>
        </div>
      </section>
      <section className="auth-form-area">
        <div className="auth-form-wrap">
          <span className="small-logo">
            <ChartNoAxesCombined size={25} />
          </span>
          <h2>{register ? "Make room for a plan." : "Welcome home."}</h2>
          <p>
            {register
              ? "Start your household’s shared budget."
              : "A little check-in. A clearer picture."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <>
                <label>
                  Your name
                  <input
                    name="full_name"
                    autoComplete="name"
                    maxLength={60}
                    placeholder="Aigerim Sadykova"
                    required
                  />
                </label>
                <label>
                  Household name
                  <input
                    name="family_name"
                    maxLength={50}
                    placeholder="The Sadykov family"
                    required
                  />
                </label>
              </>
            )}
            <label>
              Email address
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
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  minLength={register ? 8 : 1}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder={
                    register ? "At least 8 characters" : "Your password"
                  }
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {error && <ErrorNotice message={error} />}
            <button className="button primary auth-submit" disabled={busy}>
              {busy
                ? "One moment…"
                : register
                  ? "Create your household"
                  : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already part of a household?" : "New around here?"}{" "}
            <button
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="auth-note">
            <LockKeyhole size={15} />
            <span>Your household’s numbers stay in your household.</span>
          </div>
        </div>
        <span className="auth-copyright">
          Family Budget Tracker · Built around real life.
        </span>
      </section>
    </main>
  );
}
