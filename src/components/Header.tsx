import { Wifi, WifiOff, Zap } from "lucide-react";
import { useData } from "../store/DataContext";
import { StatusPill, Led } from "./ui";
import { fmtTime, normTs, num, str, toBool } from "../utils/format";

export function Header() {
  const { conn, data, status, version, wsOpen, dataAge } = useData();

  const deviceTime = normTs(data?.timestamp);
  const ip = str(data?.ip) !== "—" ? str(data?.ip) : str(status?.sta_ip);
  const wifiOn = toBool(data?.wifi) ?? toBool(status?.wifi);
  const rssi = num(status?.rssi) ?? num((status as { wifi_rssi?: unknown } | null)?.wifi_rssi);
  const fw =
    str(version?.firmware_version) !== "—"
      ? str(version?.firmware_version)
      : str(version?.version) !== "—"
        ? str(version?.version)
        : str(status?.firmware_version);

  return (
    <header className="sticky top-0 z-40 bg-panel/95 backdrop-blur-[2px] border-b border-line">
      <div className="flex items-center gap-3 px-3 md:px-4 h-[52px]">
        {/* brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded border border-warn/40 bg-warn/10 flex items-center justify-center shrink-0">
            <Zap size={16} className="text-warn" fill="currentColor" strokeWidth={1.4} />
          </span>
          <div className="leading-none min-w-0">
            <div className="font-display font-bold text-[16px] tracking-wide whitespace-nowrap">
              Smart<span className="text-acc2">Watt</span>
            </div>
            <div className="text-[8.5px] tracking-[0.22em] text-mut uppercase mt-[3px] whitespace-nowrap">
              Solar + JBD Gateway
            </div>
          </div>
        </div>

        <StatusPill status={conn} />

        {/* right cluster */}
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.1em] border border-line rounded px-2 py-[3px] text-mut"
            title="Realtime-канал WebSocket (порт 81)"
          >
            <Led color={wsOpen ? "#70D900" : "#8A969F"} pulse={wsOpen} />
            WS {wsOpen ? "81" : "—"}
          </span>

          <span className="hidden lg:flex items-center gap-1.5 text-[11px] text-mut" title="Время устройства (из телеметрии)">
            <span className="num text-ink text-[12px]">{fmtTime(deviceTime)}</span>
            <span className="text-[9px] uppercase tracking-widest">dev</span>
          </span>

          <span className="hidden md:inline num text-[12px] text-ink border border-line rounded px-2 py-[3px]" title="IP Gateway">
            {ip}
          </span>

          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-[11px] border border-line rounded px-2 py-[3px]"
            title="Wi-Fi статус и RSSI"
          >
            {wifiOn === false ? (
              <WifiOff size={12} className="text-bad" />
            ) : (
              <Wifi size={12} className={wifiOn ? "text-ok" : "text-mut"} />
            )}
            <span className={`num ${rssi === null ? "text-mut" : "text-ink"}`}>{rssi === null ? "—" : `${Math.round(rssi)} dBm`}</span>
          </span>

          <span
            className="hidden md:inline text-[10px] font-semibold text-acc2 border border-acc/40 bg-acc/10 rounded px-2 py-[3px] tracking-[0.08em]"
            title="Версия прошивки (GET /api/version)"
          >
            {fw}
          </span>

          <span className="hidden xl:inline text-[10px] text-mut num" title="Возраст данных">
            age {dataAge === null ? "—" : `${(dataAge / 1000).toFixed(1)}s`}
          </span>
        </div>
      </div>
    </header>
  );
}
