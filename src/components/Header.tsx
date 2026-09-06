import { Zap, Wifi, WifiOff } from "lucide-react";
import { useData } from "../store/DataContext";
import { StatusPill } from "./ui";
import { age, boolChip, fmt, fmtTime, str, toBool } from "../utils/format";

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start px-2.5 border-l border-line/70 first:border-0">
      <span className="text-[8.5px] tracking-[0.16em] uppercase text-mut/80">{label}</span>
      <span className="num text-[11.5px] text-ink/95 leading-tight">{children}</span>
    </div>
  );
}

export function Header() {
  const { conn, data, status, version, dataAge, measureTs } = useData();

  const fw =
    str(version?.firmware_version) !== "—"
      ? str(version?.firmware_version)
      : str(version?.version) !== "—"
        ? str(version?.version)
        : str(status?.firmware_version);

  const ip = str(data?.ip ?? status?.sta_ip);
  const wifiOn = toBool(data?.wifi ?? status?.wifi);
  const ssid = str(status?.connected_ssid);
  const rssi = status?.rssi ?? null;

  return (
    <header className="border-b border-line bg-panel/90 sticky top-0 z-40">
      {/* тонкая сигнальная линия */}
      <div
        className="h-[2px] w-full"
        style={{
          background:
            conn === "ONLINE"
              ? "linear-gradient(90deg, transparent, #0878D1 30%, #70D900 60%, transparent)"
              : conn === "OFFLINE"
                ? "linear-gradient(90deg, transparent, #FF3D32 50%, transparent)"
                : "linear-gradient(90deg, transparent, #0878D1 50%, transparent)",
        }}
      />
      <div className="flex items-center gap-3 px-3 md:px-4 h-[52px] flex-wrap md:flex-nowrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-md bg-acc/15 border border-acc/40 flex items-center justify-center shrink-0">
            <Zap size={16} className="text-acc2" fill="currentColor" strokeWidth={1} />
          </span>
          <div className="leading-none min-w-0">
            <div className="font-display font-bold text-[16px] tracking-[0.02em] whitespace-nowrap">
              SmartWatt
            </div>
            <div className="text-[9.5px] text-mut tracking-[0.14em] uppercase mt-[3px] hidden sm:block">
              Солнечная энергетическая система
            </div>
          </div>
        </div>

        <StatusPill status={conn} />

        <div className="flex items-center ml-auto overflow-x-auto max-w-full">
          <InfoCell label="IP">
            {ip}
          </InfoCell>
          <InfoCell label="Wi-Fi">
            <span className="inline-flex items-center gap-1">
              {wifiOn === null ? (
                "—"
              ) : wifiOn ? (
                <Wifi size={11} className="text-ok" />
              ) : (
                <WifiOff size={11} className="text-mut" />
              )}
              {wifiOn ? (ssid !== "—" ? ssid : "подключено") : wifiOn === false ? "отключено" : "—"}
              {rssi !== null && <span className="text-mut">{fmt(rssi, 0)} dBm</span>}
            </span>
          </InfoCell>
          <InfoCell label="Прошивка">{fw}</InfoCell>
          <InfoCell label="Измерение">{fmtTime(measureTs)}</InfoCell>
          <InfoCell label="Возраст">
            <span className={dataAge !== null && dataAge > 10_000 ? "text-warn" : ""}>{age(dataAge)}</span>
          </InfoCell>
        </div>
      </div>
      {/* индикатор состояния нагрузки контроллера (реальный loadState) */}
      <div className="hidden">
        {boolChip(data?.loadState)}
      </div>
    </header>
  );
}
