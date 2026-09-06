import {
  BarChart3,
  BatteryCharging,
  CircuitBoard,
  Home,
  Plug,
  Settings,
  Sun,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useData } from "../store/DataContext";
import { apiOriginLabel } from "../services/api";
import { SubsystemChip } from "./ui";
import type { SubsystemState } from "../types";

export type PageId = "home" | "battery" | "bms" | "solar" | "load" | "stats" | "settings" | "engineering";

export const NAV_ITEMS: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "battery", label: "Батарея", icon: BatteryCharging },
  { id: "bms", label: "BMS", icon: CircuitBoard },
  { id: "solar", label: "Солнце (PV)", icon: Sun },
  { id: "load", label: "Нагрузка", icon: Plug },
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "settings", label: "Настройки", icon: Settings },
  { id: "engineering", label: "Инженерный режим", icon: Wrench },
];

export function Sidebar({ page, onNavigate }: { page: PageId; onNavigate: (p: PageId) => void }) {
  const { conn, bmsState, controllerState } = useData();

  const rows: { label: string; state: SubsystemState }[] = [
    { label: "Шлюз ESP32", state: conn === "ONLINE" ? "ONLINE" : conn === "STALE" ? "STALE" : conn === "OFFLINE" ? "OFFLINE" : "NO_DATA" },
    { label: "BMS (JBD)", state: bmsState },
    { label: "Контроллер (Modbus)", state: controllerState },
  ];

  return (
    <aside className="hidden md:flex flex-col w-[196px] shrink-0 border-r border-line bg-panel/70">
      <nav className="flex-1 p-2.5 space-y-[3px]">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-2.5 rounded px-2.5 py-[9px] text-left text-[12.5px] font-medium transition-all duration-150 ${
                active
                  ? "bg-acc text-white shadow-[0_2px_12px_rgba(8,120,209,0.35)]"
                  : "text-mut hover:text-ink hover:bg-panel2"
              }`}
            >
              <Icon size={15} strokeWidth={active ? 2.2 : 1.9} className={active ? "text-white" : ""} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* состояния подсистем */}
      <div className="p-2.5 border-t border-line space-y-[7px]">
        {rows.map(({ label, state }) => (
          <div key={label} className="flex items-center justify-between gap-2 px-1">
            <span className="text-[9.5px] tracking-[0.1em] text-mut uppercase">{label}</span>
            <SubsystemChip state={state} />
          </div>
        ))}
        <div className="px-1 pt-1.5 border-t border-line/60">
          <div className="text-[9px] text-mut/70 uppercase tracking-[0.12em]">Адрес шлюза</div>
          <div className="num text-[10px] text-mut truncate mt-0.5" title={apiOriginLabel()}>
            {apiOriginLabel()}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({ page, onNavigate }: { page: PageId; onNavigate: (p: PageId) => void }) {
  return (
    <div className="md:hidden border-b border-line bg-panel/80 overflow-x-auto">
      <div className="flex gap-1 px-2 py-1.5 min-w-max">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-1.5 rounded px-2.5 py-[7px] text-[11px] font-medium whitespace-nowrap transition-colors ${
                active ? "bg-acc text-white" : "text-mut hover:text-ink bg-panel2"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
