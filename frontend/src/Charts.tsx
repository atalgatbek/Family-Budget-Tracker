import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "./api";
import type { Summary } from "./types";

export function SpendingChart({ summary }: { summary: Summary }) {
  const days = new Date(
    Number(summary.month.slice(0, 4)),
    Number(summary.month.slice(5)),
    0,
  ).getDate();
  let cumulative = 0;
  const points = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    cumulative +=
      summary.daily.find((item) => Number(item.date.slice(-2)) === day)
        ?.amount_kzt ?? 0;
    return {
      day,
      spent: cumulative,
      pace: Math.round((summary.planned_kzt / days) * day),
    };
  });
  return (
    <div
      className="chart-wrap"
      role="img"
      aria-label={`Cumulative spending for ${summary.month}: ${money(summary.spent_kzt)} against a ${money(summary.planned_kzt)} monthly plan.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          margin={{ top: 10, right: 7, left: -18, bottom: 0 }}
        >
          <defs>
            <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--chart-fill)"
                stopOpacity={0.25}
              />
              <stop
                offset="100%"
                stopColor="var(--chart-fill)"
                stopOpacity={0.01}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--chart-grid)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="day"
            ticks={[1, 5, 10, 15, 20, 25, days]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "var(--chart-tick)" }}
            tickFormatter={(v) => `${String(v).padStart(2, "0")}`}
            dy={9}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "var(--chart-tick)" }}
            tickFormatter={(v) => `${v / 1000}k`}
          />
          <Tooltip
            formatter={(value, name) => [
              money(Number(value)),
              name === "spent" ? "Spent so far" : "Budget pace",
            ]}
            labelFormatter={(value) => `Day ${value}`}
            contentStyle={{
              border: "1px solid var(--line)",
              background: "var(--paper)",
              color: "inherit",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="linear"
            dataKey="pace"
            stroke="var(--chart-pace)"
            strokeDasharray="5 5"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
          />
          <Area
            type="monotone"
            dataKey="spent"
            stroke="var(--chart-line)"
            strokeWidth={2.5}
            fill="url(#spend-fill)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
