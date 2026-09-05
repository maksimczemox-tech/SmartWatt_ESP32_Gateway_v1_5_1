import { Zap } from "lucide-react";
import { clampPct, pct } from "../utils/format";

/**
 * Технический индикатор аккумулятора.
 * Высота заполнения = реальный SOC из телеметрии.
 * SOC отсутствует => пустой корпус и "—", никакого искусственного уровня.
 */
export function BatteryVisual({
  soc,
  charging = false,
  height = 176,
}: {
  soc: unknown;
  charging?: boolean;
  height?: number;
}) {
  const p = clampPct(soc);
  const color =
    p === null ? "#27404F" : charging ? "#70D900" : p < 20 ? "#FF3D32" : p < 45 ? "#FFC400" : "#70D900";

  return (
    <div className="flex items-stretch gap-2.5 justify-center select-none">
      {/* шкала */}
      <div className="flex flex-col justify-between py-[2px] text-right" style={{ height }}>
        {[100, 75, 50, 25, 0].map((t) => (
          <span key={t} className="num text-[9px] text-mut/70 leading-none">
            {t}
          </span>
        ))}
      </div>

      <div className="flex flex-col items-center">
        {/* клемма */}
        <div className="w-9 h-[7px] rounded-t-[3px] bg-line2 border border-line2" />
        {/* корпус */}
        <div
          className="relative w-[96px] border-2 border-line2 rounded-[6px] bg-panel2 overflow-hidden"
          style={{ height }}
        >
          {/* насечки 25/50/75 */}
          {[25, 50, 75].map((t) => (
            <div
              key={t}
              className="absolute left-0 right-0 border-t border-dashed border-line/80 z-10 pointer-events-none"
              style={{ bottom: `${t}%` }}
            />
          ))}

          {/* заполнение = реальный SOC */}
          {p !== null && (
            <div
              className="absolute left-0 right-0 bottom-0 transition-[height] duration-700 ease-out"
              style={{
                height: `${p}%`,
                background: `linear-gradient(180deg, ${color}E6 0%, ${color}99 100%)`,
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: color }} />
              {charging && (
                <div
                  className="charge-sheen absolute left-0 right-0 h-10 pointer-events-none"
                  style={{ background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.35), transparent)" }}
                />
              )}
            </div>
          )}

          {/* значение */}
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1">
            {charging && p !== null && <Zap size={13} className="text-white/90" fill="currentColor" />}
            <span
              className={`num font-semibold text-[22px] leading-none ${
                p === null ? "text-mut/70" : "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
              }`}
            >
              {pct(soc)}
            </span>
            <span className="text-[8.5px] tracking-[0.2em] uppercase text-white/60 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {p === null ? "нет данных" : charging ? "заряд" : "SOC"}
            </span>
          </div>
        </div>
      </div>

      {/* цветовая легенда */}
      <div className="flex flex-col justify-center gap-1.5 text-[9px] text-mut">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: "#70D900" }} />
          норма / заряд
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: "#FFC400" }} />
          &lt; 45%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: "#FF3D32" }} />
          &lt; 20%
        </span>
      </div>
    </div>
  );
}
