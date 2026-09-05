import {
  BarChart3,
  BatteryCharging,
  CircuitBoard,
  Home,
  Settings,
  Sun,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useData } from "../store/DataContext";
import { apiOriginLabel } from "../services/api";
import { Led } from "./ui";

export type PageId = "home" | "battery" | "bms" | "solar" | "stats" | "settings" | "engineering";

export const NAV_ITEMS: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "battery", label: "Батарея", icon: BatteryCharging },
  { id: "bms", label: "BMS", icon: CircuitBoard },
  { id: "solar", label: "Солнце", icon: Sun },
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "settings", label: "Настройки", icon: Settings },
  { id: "engineering", label: "Инженерное меню", icon: Wrench },
];

const CONN_COLOR: Record<string, string> = {
  ONLINE: "#70D900",
  STALE: "#FFC400",
  CONNECTING: "#0878D1",
  RECONNECTING: "#FFC400",
  OFFLINE: "#FF3D32",
};

const SUB_COLOR: Record<string, string> = {
  ONLINE: "#70D900",
  OFFLINE: "#FF3D32",
  NO_DATA: "#8A969F",
};

export function Sidebar({ page, onNavigate }: { page: PageId; onNavigate: (p: PageId) => void }) {
  const { conn, bmsState, controllerState } = useData();

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
        {(
          [
            ["GATEWAY", conn, CONN_COLOR[conn]],
            ["BMS (JBD)", bmsState, SUB_COLOR[bmsState]],
            ["MPPT (Modbus)", controllerState, SUB_COLOR[controllerState]],
          ] as [string, string, string][]
        ).map(([label, state, color]) => (
          <div key={label} className="flex items-center justify-between px-1">
            <span className="text-[9.5px] tracking-[0.12em] text-mut uppercase">{label}</span>
            <span className="flex items-center gap-1.5 text-[9.5px] font-semibold" style={{ color }}>
              <Led color={color} pulse={state === "ONLINE"} />
              {state === "NO_DATA" ? "N/A" : state}
            </span>
          </div>
        ))}
        <div className="px-1 pt-1.5 border-t border-line/60">
          <div className="text-[9px] text-mut/70 uppercase tracking-[0.12em]">Gateway URL</div>
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
