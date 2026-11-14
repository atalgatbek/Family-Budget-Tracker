import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { dateFull, decimal } from "./api";
import type { Rates } from "./currency";
import { useI18n, type Key } from "./i18n";

// Shown in this order; the colours reuse the category palette.
const currencies = [
  { code: "USD", symbol: "$", color: "food" },
  { code: "EUR", symbol: "€", color: "utilities" },
  { code: "RUB", symbol: "₽", color: "children" },
  { code: "CNY", symbol: "¥", color: "transport" },
];

/** A small line of the week's rates; the last day is marked with a dot. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 104;
  const height = 34;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => [
    pad + (index * (width - pad * 2)) / (values.length - 1),
    max === min
      ? height / 2
      : pad + (1 - (value - min) / (max - min)) * (height - pad * 2),
  ]);
  const line = points
    .map(
      ([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`,
    )
    .join(" ");
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg
      className="rate-spark"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path
        d={`${line} L${lastX.toFixed(1)} ${height} L${pad} ${height} Z`}
        fill="currentColor"
        opacity="0.1"
      />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.6" fill="currentColor" />
    </svg>
  );
}

export default function RatesPanel({
  data,
  failed,
}: {
  data: Rates | null;
  failed: boolean;
}) {
  const { t } = useI18n();
  return (
    <section className="panel rates-panel" aria-label={t("rates.aria")}>
      <div className="rates-head">
        <span className="eyebrow">{t("rates.title")}</span>
        {data && (
          <small>{t("rates.source", { date: dateFull(data.as_of) })}</small>
        )}
      </div>
      {failed && !data ? (
        <p className="rates-empty">{t("rates.unavailable")}</p>
      ) : (
        <div className="rate-tiles">
          {currencies.map(({ code, symbol, color }) => {
            const row = data?.rates.find((item) => item.code === code);
            const change = row?.change_percent ?? 0;
            const trend = change > 0 ? "up" : change < 0 ? "down" : "flat";
            const Icon =
              trend === "up"
                ? TrendingUp
                : trend === "down"
                  ? TrendingDown
                  : Minus;
            return (
              <div className="rate-tile" key={code}>
                <div className="rate-name">
                  <span
                    className="category-icon small"
                    style={{
                      color: `var(--cat-${color})`,
                      background: `var(--cat-${color}-bg)`,
                    }}
                  >
                    {symbol}
                  </span>
                  <div>
                    <strong>{code}</strong>
                    <small>{t(`currency.${code}` as Key)}</small>
                  </div>
                </div>
                <div className={`rate-value ${trend}`}>
                  <strong>
                    {row ? decimal(row.rate) : "—"} <span>₸</span>
                  </strong>
                  {row && (
                    <Sparkline values={row.history.map((day) => day.rate)} />
                  )}
                </div>
                <span className={`rate-change ${trend}`}>
                  {row ? (
                    <>
                      <Icon size={13} strokeWidth={2.2} />
                      {trend === "flat"
                        ? t("rates.same")
                        : `${change > 0 ? "+" : "−"}${decimal(Math.abs(change))}%`}
                      <small>{t("rates.week")}</small>
                    </>
                  ) : (
                    " "
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
