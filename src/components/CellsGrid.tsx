import { useData } from "../store/DataContext";
import type { BmsData } from "../types";
import { DASH, fmt, num } from "../utils/format";
import { EmptyState } from "./ui";
import { Cpu } from "lucide-react";

/**
 * CELL VOLTAGE: количество ячеек определяется реальным cells[] / cell_count.
 * Min/Max/Delta/Average — из полей backend, при их отсутствии — расчёт
 * только из реального массива cells[] (без выдуманных значений).
 */
export function CellsGrid({ bms }: { bms: BmsData | null }) {
  const { showSources } = useData();

  if (!bms || !Array.isArray(bms.cells) || bms.cells.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        title={bms && bms.online === false ? "BMS OFFLINE" : "Нет данных о ячейках"}
        hint="Массив cells[] не получен от JBD BMS"
      />
    );
  }

  const indexed = bms.cells
    .map((v, i) => ({ i, v: num(v) }))
    .filter((x): x is { i: number; v: number } => x.v !== null);

  if (indexed.length === 0) {
    return <EmptyState icon={Cpu} title="Нет данных о ячейках" hint="cells[] получен, но значения отсутствуют" />;
  }

  const arrMin = Math.min(...indexed.map((x) => x.v));
  const arrMax = Math.max(...indexed.map((x) => x.v));
  const minV = num(bms.min_cell_v) ?? arrMin;
  const maxV = num(bms.max_cell_v) ?? arrMax;
  const delta = num(bms.delta_cell_v) ?? maxV - minV;
  const avg = indexed.reduce((s, x) => s + x.v, 0) / indexed.length;
  const minIdx = indexed.find((x) => x.v === arrMin)?.i;
  const maxIdx = indexed.find((x) => x.v === arrMax)?.i;
  const span = arrMax - arrMin;

  const summary: { label: string; v: string; color: string }[] = [
    { label: "Min Cell", v: `${fmt(minV, 3)} V`, color: "#FF3D32" },
    { label: "Max Cell", v: `${fmt(maxV, 3)} V`, color: "#70D900" },
    { label: "Delta", v: `${fmt(delta * 1000, 0)} mV`, color: "#FFC400" },
    { label: "Average", v: `${fmt(avg, 3)} V`, color: "#2F9BE8" },
  ];

  return (
    <div>
      {/* сводка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3.5">
        {summary.map((s, i) => (
          <div key={s.label} className="reveal rounded border border-line bg-panel2/70 px-2.5 py-2" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="text-[9px] tracking-[0.16em] uppercase text-mut">{s.label}</div>
            <div className="num font-semibold text-[15px] mt-0.5" style={{ color: s.color }}>
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {/* ячейки */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))" }}>
        {bms.cells.map((raw, i) => {
          const v = num(raw);
          const isMin = v !== null && v === arrMin && indexed.length > 1;
          const isMax = v !== null && v === arrMax && indexed.length > 1;
          const barPct = v === null ? 0 : span === 0 ? 100 : Math.max(8, ((v - arrMin) / span) * 100);
          const color = isMin ? "#FF3D32" : isMax ? "#70D900" : "#0878D1";
          return (
            <div
              key={i}
              className="reveal rounded border border-line bg-panel2/70 px-2 py-1.5 card-hover"
              style={{ animationDelay: `${i * 22}ms`, borderColor: isMin || isMax ? `${color}55` : undefined }}
              title={isMin ? `Минимальная ячейка (#${(minIdx ?? i) + 1})` : isMax ? `Максимальная ячейка (#${(maxIdx ?? i) + 1})` : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] tracking-[0.12em] uppercase text-mut">Cell {i + 1}</span>
                {(isMin || isMax) && <span className="w-[6px] h-[6px] rounded-full led" style={{ backgroundColor: color, color }} />}
              </div>
              <div className="num font-semibold text-[14px] mt-0.5" style={{ color: v === null ? "#8A969F" : "#F1F4F6" }}>
                {v === null ? DASH : v.toFixed(3)}
                {v !== null && <span className="text-[10px] text-mut ml-0.5">V</span>}
              </div>
              <div className="h-[3px] rounded-full bg-line mt-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${barPct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {showSources && (
        <div className="num text-[9px] text-acc2/80 mt-2.5 border border-line rounded px-1.5 py-0.5 inline-block">
          /api/bms · cells[{bms.cells.length}] (cell_count: {fmt(bms.cell_count, 0)})
        </div>
      )}
    </div>
  );
}
