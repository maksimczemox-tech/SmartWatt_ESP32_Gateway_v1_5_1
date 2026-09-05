import { BatteryCharging, ChevronDown, Plug, Sun } from "lucide-react";
import { useData } from "../store/DataContext";
import { boolChip, fmt, num, toBool } from "../utils/format";
import { OnOffChip } from "./ui";

/**
 * Энергетическая схема PV → BATTERY → LOAD.
 * Линии активны только когда соответствующее состояние подтверждено
 * реальными значениями из телеметрии. Анимация потока — визуальная,
 * значения не создаёт и не изменяет.
 */

function FlowNode({
  icon,
  title,
  value,
  unit,
  color,
  active,
  state,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  unit?: string;
  color: string;
  active: boolean;
  state?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-md border px-3.5 py-3 bg-panel2 transition-colors duration-300"
      style={{ borderColor: active ? `${color}66` : "#1A2A35" }}
    >
      <span
        className="w-9 h-9 rounded flex items-center justify-center shrink-0 transition-colors"
        style={{ backgroundColor: `${color}${active ? "1F" : "0D"}`, color: active ? color : "#8A969F" }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[9.5px] tracking-[0.18em] uppercase text-mut">{title}</div>
        <div className="num font-semibold text-[20px] leading-6" style={{ color: active ? color : "#8A969F" }}>
          {value}
          {value !== "—" && unit && <span className="text-[11px] text-mut ml-1">{unit}</span>}
        </div>
      </div>
      <div className="ml-auto">{state}</div>
    </div>
  );
}

function FlowLink({
  active,
  color,
  watts,
  caption,
}: {
  active: boolean;
  color: string;
  watts: number | null;
  caption: string;
}) {
  return (
    <div className="relative flex flex-col items-center" style={{ height: 52 }}>
      <div
        className={`w-[3px] flex-1 ${active ? "flowline" : "bg-line"}`}
        style={active ? { color } : undefined}
      />
      <ChevronDown size={15} className="-mt-1" style={{ color: active ? color : "#27404F" }} strokeWidth={2.4} />
      <span
        className="absolute left-1/2 top-1/2 -translate-y-1/2 ml-4 num text-[10px] border rounded px-1.5 py-px bg-panel whitespace-nowrap"
        style={{
          color: active ? color : "#8A969F",
          borderColor: active ? `${color}55` : "#1A2A35",
        }}
      >
        {caption} {watts === null ? "—" : `${fmt(watts, 0)} W`}
      </span>
    </div>
  );
}

export function EnergyFlow() {
  const { data } = useData();

  const pvW = num(data?.pvPower);
  const chgW = num(data?.chargePower);
  const loadW = num(data?.loadPower);
  const loadOn = toBool(data?.loadState) === true || (loadW ?? 0) > 0;
  const charging = (chgW ?? 0) > 0;
  const pvActive = (pvW ?? 0) > 0 || charging;
  const directFeed = pvActive && loadOn;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_230px] gap-4">
      <div className="flex flex-col items-stretch max-w-[400px] mx-auto w-full">
        <FlowNode
          icon={<Sun size={18} strokeWidth={1.9} />}
          title="PV · Солнечные панели"
          value={fmt(pvW, 0)}
          unit="W"
          color="#FFC400"
          active={pvActive}
          state={
            <span className="num text-[11px] text-mut">
              {fmt(data?.pvVoltage, 1)} V · {fmt(data?.pvCurrent, 2)} A
            </span>
          }
        />
        <FlowLink active={charging || pvActive} color="#70D900" watts={chgW} caption="заряд" />
        <FlowNode
          icon={<BatteryCharging size={18} strokeWidth={1.9} />}
          title="Battery · АКБ"
          value={fmt(data?.batteryVoltage, 2)}
          unit="V"
          color="#70D900"
          active={charging || (num(data?.batteryVoltage) !== null)}
          state={
            <span className="num text-[11px] text-mut">
              SOC {fmt(data?.batterySOC, 0)}% · {fmt(data?.batteryCurrent, 2)} A
            </span>
          }
        />
        <FlowLink active={loadOn} color="#FF3D32" watts={loadW} caption="нагрузка" />
        <FlowNode
          icon={<Plug size={18} strokeWidth={1.9} />}
          title="Load · Нагрузка"
          value={fmt(loadW, 0)}
          unit="W"
          color="#FF3D32"
          active={loadOn}
          state={<OnOffChip value={boolChip(data?.loadState)} />}
        />
      </div>

      {/* легенда потоков */}
      <div className="rounded-md border border-line bg-panel2/60 p-3 self-start">
        <div className="text-[9.5px] tracking-[0.18em] uppercase text-mut mb-2.5">Потоки мощности</div>
        {(
          [
            ["PV → Battery", charging || pvActive, "#70D900", chgW],
            ["Battery → Load", loadOn, "#FF3D32", loadW],
            ["Direct PV → Load", directFeed, "#FFC400", null],
          ] as [string, boolean, string, number | null][]
        ).map(([label, active, color, w]) => (
          <div key={label} className="flex items-center gap-2 py-[5px] border-b border-line/50 last:border-0">
            <span
              className={`w-[7px] h-[7px] rounded-full ${active ? "led" : ""}`}
              style={{ backgroundColor: active ? color : "#27404F", color }}
            />
            <span className={`text-[11px] ${active ? "text-ink" : "text-mut"}`}>{label}</span>
            <span className="num text-[11px] ml-auto" style={{ color: active ? color : "#8A969F" }}>
              {w === null ? (active ? "активен" : "—") : `${fmt(w, 0)} W`}
            </span>
          </div>
        ))}
        <p className="text-[10px] text-mut/70 leading-relaxed mt-2.5">
          Линии активируются только при реальных значениях мощности из телеметрии Gateway.
        </p>
      </div>
    </div>
  );
}
