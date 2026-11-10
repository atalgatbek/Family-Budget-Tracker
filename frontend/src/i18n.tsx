import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "./locales/en";
import ru, { ruServer } from "./locales/ru";
import kk, { kkServer } from "./locales/kk";

export type Lang = "kk" | "ru" | "en";
export type Key = keyof typeof en;
type Vars = Record<string, string | number>;
/** Keys that have _one/_few/_many/_other forms. */
type CountKey = "house.members";

export const languages: { id: Lang; short: string; name: string }[] = [
  { id: "kk", short: "ҚАЗ", name: "Қазақша" },
  { id: "ru", short: "РУС", name: "Русский" },
  { id: "en", short: "ENG", name: "English" },
];
const dictionaries: Record<Lang, Record<Key, string>> = { en, ru, kk };
const serverTexts: Record<Lang, Record<string, string>> = {
  en: {},
  ru: ruServer,
  kk: kkServer,
};
const locales: Record<Lang, string> = {
  en: "en-US",
  ru: "ru-RU",
  kk: "kk-KZ",
};
const isLang = (value: unknown): value is Lang =>
  value === "kk" || value === "ru" || value === "en";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (isLang(saved)) return saved;
  } catch {
    /* Storage is unavailable: use the browser language. */
  }
  for (const value of navigator.languages ?? [navigator.language]) {
    const short = value.slice(0, 2).toLowerCase();
    if (isLang(short)) return short;
  }
  return "en";
}

// Kept outside React so the formatters in api.ts can read it.
let current: Lang = initialLang();
export const getLang = () => current;
export const getLocale = () => locales[current];

function translate(lang: Lang, key: Key, vars?: Vars) {
  const text = dictionaries[lang][key];
  return vars
    ? text.replace(/\{(\w+)\}/g, (match, name) =>
        name in vars ? String(vars[name]) : match,
      )
    : text;
}

function makeApi(lang: Lang, setLang: (lang: Lang) => void) {
  const t = (key: Key, vars?: Vars) => translate(lang, key, vars);
  return {
    lang,
    setLang,
    t,
    /** Picks the plural form that matches the count. */
    tn: (key: CountKey, count: number) => {
      const form = new Intl.PluralRules(locales[lang]).select(count);
      const full = `${key}_${form}`;
      return t((full in dictionaries[lang] ? full : `${key}_other`) as Key, {
        count,
      });
    },
    /** Translates fixed server texts: default categories, statuses, errors. */
    ts: (text: string) => serverTexts[lang][text] ?? text,
  };
}
export type I18n = ReturnType<typeof makeApi>;

const I18nContext = createContext<I18n>(makeApi(current, () => {}));
export const useI18n = () => useContext(I18nContext);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const value = useMemo(
    () =>
      makeApi(lang, (next) => {
        current = next;
        try {
          localStorage.setItem("lang", next);
        } catch {
          /* The choice still applies for this visit. */
        }
        setLangState(next);
      }),
    [lang],
  );
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = translate(lang, "doc.title");
  }, [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t("lang.label")}>
      {languages.map((item) => (
        <button
          type="button"
          key={item.id}
          lang={item.id}
          title={item.name}
          aria-pressed={lang === item.id}
          onClick={() => setLang(item.id)}
        >
          {item.short}
        </button>
      ))}
    </div>
  );
}
