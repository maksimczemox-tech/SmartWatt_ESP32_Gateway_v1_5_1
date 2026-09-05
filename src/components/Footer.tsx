import { useData } from "../store/DataContext";
import { StatusPill } from "./ui";
import { DASH, age, dur, fmtTime, num } from "../utils/format";
import { DATA_SOURCE } from "../services/api";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[9px] tracking-[0.12em] uppercase text-mut/80">{label}</span>
      <span className="num text-[11px] text-ink/90">{children}</span>
    </span>
  );
}

function Sep() {
  return <span className="w-px h-3.5 bg-line hidden sm:block" />;
}

export function Footer() {
  const { conn, receivedAt, measureTs, dataAge, counters, status, bms } = useData();

  const modbusErr = num(status?.modbus_errors);
  const bmsErr = num(bms?.diagnostics?.errors) ?? num(status?.bms_errors);
  const timeouts = num(bms?.diagnostics?.timeouts);
  const crc = num(bms?.diagnostics?.crc_errors);
  const proto = num(bms?.diagnostics?.protocol_errors);
  const uptime = status?.uptime_ms ?? null;

  return (
    <footer className="border-t border-line bg-panel/90 px-3 md:px-4 py-2">
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
        <StatusPill status={conn} compact />
        <Item label="Последнее измерение">{fmtTime(measureTs)}</Item>
        <Item label="Возраст данных">{age(dataAge)}</Item>
        <Item label="Получено">{fmtTime(receivedAt)}</Item>

        <Sep />
        {/* счётчики интерфейса (браузер), не счётчики ESP32 */}
        <Item label="HTTP-запросы интерфейса">{counters.requests}</Item>
        <Item label="Ошибки HTTP интерфейса">{counters.errors}</Item>

        <Sep />
        {/* диагностика оборудования — только реальные значения */}
        <Item label="Ошибки Modbus">{modbusErr === null ? DASH : modbusErr}</Item>
        <Item label="Ошибки BMS">{bmsErr === null ? DASH : bmsErr}</Item>
        <Item label="Тайм-ауты">{timeouts === null ? DASH : timeouts}</Item>
        <Item label="CRC">{crc === null ? DASH : crc}</Item>
        <Item label="Протокол">{proto === null ? DASH : proto}</Item>
        <Item label="Время работы">{dur(uptime)}</Item>

        <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 text-[9px] tracking-[0.16em] uppercase text-mut/70">
          <span className="w-[6px] h-[6px] rounded-full bg-ok led" style={{ color: "#70D900" }} />
          Источник данных: реальные данные ({DATA_SOURCE}) · ESP32 Gateway
        </span>
      </div>
    </footer>
  );
}
