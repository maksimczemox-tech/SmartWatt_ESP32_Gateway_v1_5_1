import type { BmsData } from "../types";
import { fmt, num } from "../utils/format";
import { EmptyState } from "./ui";
import { BatteryLow } from "lucide-react";

function cellColor(v: number, min: number, max: number): string {
  if (v < 2.9) return "#FF3D32";
  if (v < 3.1) return "#FFC400";
  if (max > min && v === min) return "#FFC400";
  if (max > min && v === max) return "#70D900";
  return "#2F9BE8";
}

/**
 * Напряжения ячеек JBD BMS.
 * Количество ячеек НЕ фиксировано — только реальный массив cells[].
 * Сводка берётся из полей backend; при их отсутствии — только из реального массива.
 */
export function CellsGrid({ bms }: { bms: BmsData | null }) {
  const cells = bms?.cells ?? null;

  if (!cells || cells.length === 0) {
    return (
      <EmptyState
        icon={BatteryLow}
        title="Ячейки не получены"
        hint="Массив cells[] отсутствует или пуст — данные от JBD BMS не пришли"
        compact
      />
    );
  }

  const vals = cells
    .map((c, i) => ({ v: num(c), i }))
    .filter((x): x is { v: number; i: number } => x.v !== null);

  const min = vals.length ? Math.min(...vals.map((x) => x.v)) : null;
  const max = vals.length ? Math.max(...vals.map((x) => x.v)) : null;

  const minV = num(bms?.min_cell_v) ?? min;
  const maxV = num(bms?.max_cell_v) ?? max;
  const delta = num(bms?.delta_cell_v) ?? (minV !== null && maxV !== null ? maxV - minV : null);
  const avg =
    vals.length > 0 ? vals.reduce((s, x) => s + x.v, 0) / vals.length : null;

  return (
    <div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}>
        {cells.map((c, i) => {
          const v = num(c);
          const color = v === null || min === null || max === null ? "#27404F" : cellColor(v, min, max);
          return (
            <div
              key={i}
              className="rounded border bg-panel2/70 px-2 py-1.5 card-hover"
              style={{ borderColor: v === null ? "#1A2A35" : `${color}44` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] tracking-[0.1em] uppercase text-mut">Ячейка {i + 1}</span>
                <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: color }} />
              </div>
              <div className="num text-[14px] font-semibold mt-0.5" style={{ color: v === null ? "#8A969F" : "#F1F4F6" }}>
                {v === null ? "—" : v.toFixed(3)}
                {v !== null && <span className="text-[9px] text-mut ml-1">V</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {(
          [
            ["Мин. ячейка", minV, 3, "#FFC400"],
            ["Макс. ячейка", maxV, 3, "#70D900"],
            ["Разброс", delta === null ? null : delta * 1000, 0, "#FF3D32"],
            ["Среднее", avg, 3, "#2F9BE8"],
          ] as [string, number | null, number, string][]
        ).map(([label, v, d, color]) => (
          <div key={label} className="rounded border border-line bg-panel2/50 px-2 py-1.5">
            <div className="text-[9px] tracking-[0.12em] uppercase text-mut">{label}</div>
            <div className="num text-[13px] font-semibold" style={{ color: v === null ? "#8A969F" : color }}>
              {v === null ? "—" : `${v.toFixed(d)} ${label === "Разброс" ? "mV" : "V"}`}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-mut/70">
        Ячеек получено: <span className="num text-mut">{cells.length}</span>
        {bms?.cell_count !== null && bms?.cell_count !== undefined && (
          <> · cell_count: <span className="num text-mut">{fmt(bms.cell_count, 0)}</span></>
        )}
      </div>
    </div>
  );
}
