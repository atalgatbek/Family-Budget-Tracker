import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { decimal } from "./api";
import { useI18n, type Key } from "./i18n";

export const currencyCodes = ["KZT", "USD", "EUR", "RUB", "CNY"] as const;
export type CurrencyCode = (typeof currencyCodes)[number];
export const currencySymbols: Record<CurrencyCode, string> = {
  KZT: "₸",
  USD: "$",
  EUR: "€",
  RUB: "₽",
  CNY: "¥",
};

export type Rate = {
  code: string;
  rate: number;
  week_ago: number;
  change_percent: number;
  history: { date: string; rate: number }[];
};
export type Rates = { as_of: string; compared_with: string; rates: Rate[] };

const isCode = (value: unknown): value is CurrencyCode =>
  currencyCodes.includes(value as CurrencyCode);

export function savedCurrency(): CurrencyCode {
  try {
    const value = localStorage.getItem("currency");
    if (isCode(value)) return value;
  } catch {
    /* Storage is unavailable: show tenge. */
  }
  return "KZT";
}

// Kept outside React so the money formatter in api.ts can read it.
// Everything is stored in tenge; another currency only changes the display.
let display: { code: CurrencyCode; rate: number } = { code: "KZT", rate: 1 };
export const getDisplay = () => display;

/** Falls back to tenge while the chosen currency has no rate. */
export function setDisplay(code: CurrencyCode, rates: Rates | null) {
  const rate =
    code === "KZT" ? 1 : rates?.rates.find((row) => row.code === code)?.rate;
  display = rate ? { code, rate } : { code: "KZT", rate: 1 };
  return display;
}

/** One button that opens a list of currencies with today's rate. */
export function CurrencySwitch({
  rates,
  onChange,
}: {
  rates: Rates | null;
  onChange: (code: CurrencyCode) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = display.code;
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
  function choose(code: CurrencyCode) {
    try {
      localStorage.setItem("currency", code);
    } catch {
      /* The choice still applies for this visit. */
    }
    onChange(code);
    setOpen(false);
  }
  return (
    <div className="currency-menu" ref={box}>
      <button
        type="button"
        className="currency-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t("currency.label")}: ${t(`currency.${current}` as Key)}`}
        onClick={() => setOpen(!open)}
      >
        <b>{currencySymbols[current]}</b>
        <span>{t(`currency.${current}` as Key)}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="currency-list"
          role="group"
          aria-label={t("currency.label")}
        >
          {currencyCodes.map((code) => {
            const rate = rates?.rates.find((row) => row.code === code)?.rate;
            return (
              <button
                type="button"
                key={code}
                aria-pressed={current === code}
                disabled={code !== "KZT" && !rate}
                onClick={() => choose(code)}
              >
                <b>{currencySymbols[code]}</b>
                <span>{t(`currency.${code}` as Key)}</span>
                {rate ? <small>{decimal(rate)} ₸</small> : null}
                {current === code && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
