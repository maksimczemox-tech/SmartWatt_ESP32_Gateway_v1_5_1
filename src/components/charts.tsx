import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SamplePoint } from "../types";
import { DASH, dur, fmtDateTime, fmtTime, num, ruNum } from "../utils/format";
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
  const t = num(label);
  return (
    <div className="bg-panel border border-line2 rounded px-2.5 py-2 shadow-xl">
      <div className="num text-[10px] text-mut mb-1">
        {fmtDateTime(t ?? null)} · {fmtTime(t ?? null)}
      </div>
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
 * График по реально полученным samples (WebSocket / опрос /api/data).
 *  - точки фронтендом НЕ создаются и не интерполируются;
 *  - sample с valid=false не рисуется как достоверное измерение;
 *  - окно (1 ч / 6 ч / 24 ч / 7 дней) фильтрует образцы по времени.
 */
export function SamplesChart({
  samples,
  series,
  windowHours,
  height = 190,
  sessionStart,
}: {
  samples: SamplePoint[];
  series: SeriesDef[];
  /** null — показать все samples сессии */
  windowHours: number | null;
  height?: number;
  sessionStart: number;
}) {
  const cutoff = windowHours === null ? 0 : Date.now() - windowHours * 3_600_000;
  const rows = samples
    .filter((p) => p.ts >= cutoff)
    .map((p) => {
      const bad = !p.valid;
      return {
        ts: p.ts,
        pv: series.some((s) => s.key === "pv") && !bad ? p.pv : null,
        batt: series.some((s) => s.key === "batt") && !bad ? p.batt : null,
        load: series.some((s) => s.key === "load") && !bad ? p.load : null,
        soc: series.some((s) => s.key === "soc") && !bad ? p.soc : null,
      };
    });

  if (samples.length === 0) {
    return (
      <EmptyState
        icon={LineChartIcon}
        title="Исторические данные отсутствуют"
        hint={`История доступна с момента запуска интерфейса (${fmtTime(sessionStart)}). Точки появляются по мере получения реальных фреймов от Gateway.`}
        compact
      />
    );
  }

  const hasValue = rows.some(
    (r) => r.pv !== null || r.batt !== null || r.load !== null || r.soc !== null,
  );

  if (rows.length === 0 || !hasValue) {
    const from = samples[0]?.ts ?? null;
    const to = samples[samples.length - 1]?.ts ?? null;
    const avail =
      from !== null && to !== null
        ? `Доступно истории: ${dur(to - from)} (реальные samples с ${fmtTime(from)} до ${fmtTime(to)}).`
        : "";
    return (
      <EmptyState
        icon={LineChartIcon}
        title="Недостаточно данных за выбранный период"
        hint={`${avail} Отсутствующие значения не заполняются и не интерполируются.`}
        compact
      />
    );
  }

  const span = rows.length > 1 ? rows[rows.length - 1].ts - rows[0].ts : 0;
  const wide = span > 36 * 3600 * 1000;
  const showDots = rows.length <= 2;

  const tickFmt = (v: unknown) => {
    const t = num(v);
    if (t === null) return "";
    const d = new Date(t);
    const p = (x: number) => x.toString().padStart(2, "0");
    return wide
      ? `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:00`
      : `${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /* честно сообщаем, если выбранное окно больше реально накопленного периода */
  const availSpan = samples.length > 1 ? samples[samples.length - 1].ts - samples[0].ts : null;
  const shortCoverage =
    windowHours !== null && availSpan !== null && windowHours * 3_600_000 > availSpan + 60_000;

  return (
    <div className="w-full">
      {shortCoverage && (
        <div className="num text-[9.5px] text-mut mb-1">
          Доступно истории: {dur(availSpan)} — период короче выбранного окна, пропуски не заполняются
        </div>
      )}
      <div style={{ height }}>
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
    </div>
  );
}

/** Сегментированный переключатель временного окна. */
export function WindowSwitch({
  value,
  onChange,
  options,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  options: { label: string; hours: number | null }[];
}) {
  return (
    <div className="flex rounded border border-line overflow-hidden">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.hours)}
          className={`px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors ${
            value === o.hours ? "bg-acc text-white" : "text-mut hover:text-ink bg-panel2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
