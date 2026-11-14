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

export function CurrencySwitch({
  rates,
  onChange,
}: {
  rates: Rates | null;
  onChange: (code: CurrencyCode) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="currency-switch"
      role="group"
      aria-label={t("currency.label")}
    >
      {currencyCodes.map((code) => (
        <button
          type="button"
          key={code}
          title={t(`currency.${code}` as Key)}
          aria-label={t(`currency.${code}` as Key)}
          aria-pressed={display.code === code}
          disabled={
            code !== "KZT" && !rates?.rates.some((row) => row.code === code)
          }
          onClick={() => {
            try {
              localStorage.setItem("currency", code);
            } catch {
              /* The choice still applies for this visit. */
            }
            onChange(code);
          }}
        >
          {currencySymbols[code]}
        </button>
      ))}
    </div>
  );
}
