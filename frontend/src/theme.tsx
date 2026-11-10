import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "./i18n";

export type Theme = "light" | "dark";

const systemDark = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;
const savedTheme = (): Theme | null => {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : null;
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => savedTheme() ?? (systemDark() ? "dark" : "light"),
  );
  useEffect(() => {
    // Follow the system until the user makes a choice.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (!savedTheme()) setTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#121815" : "#174c3c");
  }, [theme]);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* The choice still applies for this visit. */
    }
    setTheme(next);
  }
  return { theme, toggle };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const label = t(theme === "dark" ? "theme.toLight" : "theme.toDark");
  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-checked={theme === "dark"}
      aria-label={t("theme.label")}
      title={label}
      onClick={toggle}
    >
      <span className="theme-toggle-thumb">
        {theme === "dark" ? <Moon size={13} /> : <Sun size={13} />}
      </span>
    </button>
  );
}
