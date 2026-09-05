import { RefreshCw, Wifi, WifiOff, Clock, Hourglass } from "lucide-react";
import { useData } from "../store/DataContext";
import { StatusPill, IconBtn } from "./ui";
import { age, fmt, fmtTime, str } from "../utils/format";

export function Header() {
  const { data, status, version, conn, refreshTelemetry, measureTs, receivedAt, dataAge } = useData();

  const ip = str(data?.ip ?? status?.sta_ip);
  const wifiOn =
    data?.wifi === true || data?.wifi === 1 || status?.wifi === true || status?.wifi === 1;
  const fw = str(version?.firmware_version ?? version?.version ?? status?.firmware_version);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-panel/90 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-3 md:px-4 py-2">
        {/* бренд */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded bg-acc/15 border border-acc/40 flex items-center justify-center text-acc2 shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          </div>
          <div className="leading-tight min-w-0">
            <div className="font-display font-bold text-[16px] tracking-wide whitespace-nowrap">
              Smart<span className="text-acc2">Watt</span>
            </div>
            <div className="text-[9px] tracking-[0.22em] uppercase text-mut whitespace-nowrap hidden sm:block">
              ESP32 Gateway · PV + JBD BMS
            </div>
          </div>
        </div>

        <StatusPill status={conn} />

        <div className="ml-auto flex items-center gap-2 md:gap-3 min-w-0">
          {/* Wi-Fi */}
          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-[10.5px] num text-mut"
            title={wifiOn ? `Подключено: ${str(status?.connected_ssid)}` : "Wi-Fi не подключен"}
          >
            {wifiOn ? <Wifi size={13} className="text-ok" /> : <WifiOff size={13} className="text-bad" />}
            <span className="max-w-[110px] truncate hidden md:inline">
              {wifiOn ? str(status?.connected_ssid) : "нет сети"}
            </span>
          </span>

          {/* реальный IP */}
          {ip !== "—" && (
            <span className="hidden md:inline-flex items-center gap-1 rounded border border-line bg-panel2 px-2 py-[3px] num text-[10.5px] text-ink/80">
              <span className="w-[6px] h-[6px] rounded-full bg-acc2" />
              {ip}
            </span>
          )}

          {/* прошивка из API */}
          {fw !== "—" && (
            <span className="hidden lg:inline-flex rounded border border-line bg-panel2 px-2 py-[3px] num text-[10.5px] text-mut">
              прошивка {fw}
            </span>
          )}

          <span className="hidden lg:block w-px h-5 bg-line" />

          {/* время: измерение оборудования / получение браузером / возраст данных */}
          <div className="hidden lg:flex items-center gap-3 text-[10px] text-mut whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              <Clock size={11} />
              измерение <span className="num text-ink/85">{fmtTime(measureTs)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Hourglass size={11} />
              возраст <span className="num text-ink/85">{age(dataAge)}</span>
            </span>
            <span className="text-mut/70">
              получено <span className="num text-ink/70">{fmtTime(receivedAt)}</span>
            </span>
          </div>

          {/* возраст данных на малых экранах */}
          <span className="lg:hidden num text-[10.5px] text-mut whitespace-nowrap">{age(dataAge)}</span>

          <IconBtn title="Обновить телеметрию (GET /api/data)" onClick={() => void refreshTelemetry()}>
            <RefreshCw size={13} />
          </IconBtn>
        </div>
      </div>
    </header>
  );
}
