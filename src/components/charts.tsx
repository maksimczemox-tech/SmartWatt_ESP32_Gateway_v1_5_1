import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoryPoint } from "../types";
import { DASH, fmtDateTime, normTs, num, ruNum, toBool } from "../utils/format";
import { EmptyState } from "./ui";
import { LineChart as LineChartIcon } from "lucide-react";

export interface SeriesDef {
  key: "pv" | "batt" | "load" | "soc";
  name: string;
  color: string;
  unit: string;
}

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: unknown }>;
  label?: unknown;
  defs: SeriesDef[];
}

function ChartTip({ active, payload, label, defs }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const ts = normTs(label);
  return (
    <div className="bg-panel border border-line2 rounded px-2.5 py-2 shadow-xl">
      <div className="num text-[10px] text-mut mb-1">{fmtDateTime(ts)}</div>
      {payload.map((p) => {
        const def = defs.find((d) => d.key === p.dataKey);
        if (!def) return null;
        const n = num(p.value);
        return (
          <div key={String(p.dataKey)} className="flex items-center gap-1.5 text-[11px] py-px">
            <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: def.color }} />
            <span className="text-mut">{def.name}</span>
            <span className="num text-ink ml-auto pl-3">
              {n === null ? DASH : `${ruNum(n, 1)} ${def.unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * График истории. Все точки — только из /api/history.
 *  - точка с valid = false не рисуется как достоверное измерение;
 *  - дополнительные точки не создаются, кривая не "дорисовывается";
 *  - нет данных => "Нет исторических данных".
 */
export function HistoryChart({
  points,
  series,
  height = 190,
}: {
  points: HistoryPoint[];
  series: SeriesDef[];
  height?: number;
}) {
  const rows = points.map((p) => {
    /* valid === false — измерение недостоверно, не отображаем */
    const bad = toBool(p.valid) === false;
    return {
      ts: p.ts,
      pv: series.some((s) => s.key === "pv") && !bad ? num(p.pv) : null,
      batt: series.some((s) => s.key === "batt") && !bad ? num(p.batt) : null,
      load: series.some((s) => s.key === "load") && !bad ? num(p.load) : null,
      soc: series.some((s) => s.key === "soc") && !bad ? num(p.soc) : null,
    };
  });

  const hasValue = rows.some(
    (r) => r.pv !== null || r.batt !== null || r.load !== null || r.soc !== null,
  );

  if (rows.length === 0 || !hasValue) {
    return (
      <EmptyState
        icon={LineChartIcon}
        title="Нет исторических данных"
        hint="GET /api/history не вернул достоверных точек измерений"
        compact
      />
    );
  }

  const span = rows.length > 1 ? rows[rows.length - 1].ts - rows[0].ts : 0;
  const wide = span > 36 * 3600 * 1000;
  const showDots = rows.length <= 2;

  const tickFmt = (v: unknown) => {
    const t = normTs(v);
    if (t === null) return "";
    const d = new Date(t);
    const p = (x: number) => x.toString().padStart(2, "0");
    return wide
      ? `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:00`
      : `${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1A2A35" strokeOpacity={0.7} vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={tickFmt}
            tick={{ fontSize: 10, fill: "#8A969F", fontFamily: "JetBrains Mono" }}
            stroke="#1A2A35"
            tickLine={false}
            axisLine={{ stroke: "#1A2A35" }}
            minTickGap={48}
          />
          <YAxis
            width={44}
            tickFormatter={(v) => (typeof v === "number" ? v.toLocaleString("ru-RU") : String(v))}
            tick={{ fontSize: 10, fill: "#8A969F", fontFamily: "JetBrains Mono" }}
            stroke="#1A2A35"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<ChartTip defs={series} />}
            cursor={{ stroke: "#27404F", strokeDasharray: "3 3" }}
            isAnimationActive={false}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={1.8}
              dot={showDots ? { r: 3, strokeWidth: 0, fill: s.color } : false}
              activeDot={{ r: 3.5, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
