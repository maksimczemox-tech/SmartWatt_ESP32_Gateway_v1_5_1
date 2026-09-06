import { Activity, CircuitBoard, Cpu, Shield, Thermometer } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Metric, KV, OnOffChip, CopyBtn, SubsystemChip, EmptyState } from "../components/ui";
import { CellsGrid } from "../components/CellsGrid";
import { age, boolChip, fmt, str } from "../utils/format";

function HexBlock({ label, value }: { label: string; value: unknown }) {
  const s = str(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9.5px] tracking-[0.16em] uppercase text-mut">{label}</span>
        {s !== "—" && <CopyBtn getText={() => s} />}
      </div>
      <div className="hexblock bg-bg border border-line rounded p-2.5 text-acc2/90 min-h-[42px]">
        {s === "—" ? <span className="text-mut/70">—</span> : s}
      </div>
    </div>
  );
}

export function BmsPage() {
  const { bms, bmsState } = useData();
  const diag = bms?.diagnostics ?? null;

  /* Состояние защиты: только реальный смысл кода. */
  const protCode = bms?.protection ?? null;
  const protectionLabel =
    protCode === null || protCode === undefined
      ? "Нет данных"
      : protCode === 0
        ? "Нет защиты"
        : str(bms?.protection_text) !== "—"
          ? str(bms?.protection_text)
          : `Активная защита (код ${fmt(protCode, 0)})`;

  return (
    <div>
      {/* телеметрия JBD BMS */}
      <Card
        title="BMS · JBD телеметрия"
        icon={<CircuitBoard size={13} />}
        delay={0}
        right={
          <div className="flex items-center gap-3">
            <span className="num text-[10px] text-mut">
              ячеек {fmt(bms?.cell_count, 0)} · датчиков {fmt(bms?.ntc_count, 0)}
            </span>
            <SubsystemChip state={bmsState} />
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <Metric label="Напряжение" value={bms?.voltage} digits={2} unitStr="V" size="lg" source="/api/bms · voltage" />
          <Metric label="Ток" value={bms?.current} digits={2} unitStr="A" sign source="/api/bms · current" />
          <Metric label="Мощность" value={bms?.power} digits={1} unitStr="W" sign source="/api/bms · power" />
          <Metric label="Заряд (SOC)" value={bms?.soc} digits={0} unitStr="%" tone="ok" source="/api/bms · soc" />
          <Metric label="Оставшаяся ёмкость" value={bms?.remaining_ah} digits={1} unitStr="Ah" source="/api/bms · remaining_ah" />
          <Metric label="Полная ёмкость" value={bms?.full_capacity_ah} digits={1} unitStr="Ah" source="/api/bms · full_capacity_ah" />
          <Metric label="Циклы" value={bms?.cycles} digits={0} source="/api/bms · cycles" />
        </div>
        <div className="mt-2.5 pt-2 border-t border-line/60 flex items-center gap-4 text-[11px] text-mut flex-wrap">
          <span>
            Возраст данных: <span className="num text-ink">{age(bms?.data_age_ms)}</span>
          </span>
          <span>
            Защита (код): <span className="num text-ink">{fmt(bms?.protection, 0)}</span>
          </span>
          <span className="truncate">{protectionLabel}</span>
        </div>
      </Card>

      <div className="grid xl:grid-cols-3 gap-3 mt-3">
        {/* ячейки */}
        <Card
          title={`Напряжение ячеек${bms?.cells ? ` · ${bms.cells.length}` : ""}`}
          icon={<Cpu size={13} />}
          className="xl:col-span-2"
          delay={60}
        >
          <CellsGrid bms={bms} />
        </Card>

        <div className="space-y-3">
          {/* сводка по ячейкам из полей backend */}
          <Card title="Сводка по ячейкам" icon={<Cpu size={13} />} delay={110}>
            <KV k="Минимальная ячейка">{fmt(bms?.min_cell_v, 3)} V</KV>
            <KV k="Максимальная ячейка">{fmt(bms?.max_cell_v, 3)} V</KV>
                        <KV k="Разброс ячеек">
              {bms?.delta_cell_v !== null && bms?.delta_cell_v !== undefined
                ? `${fmt(bms.delta_cell_v * 1000, 0)} mV`
                : "—"}
            </KV>
            <KV k="Среднее напряжение">
              {bms?.cells && bms.cells.filter((c) => typeof c === "number").length > 0
                ? `${(
                    (bms.cells.filter((c): c is number => typeof c === "number").reduce((s, c) => s + c, 0) /
                      bms.cells.filter((c) => typeof c === "number").length)
                  ).toFixed(3)} V`
                : "—"}
            </KV>
          </Card>

          {/* FET / режим работы */}
          <Card title="FET и режим работы" icon={<Activity size={13} />} delay={150}>
            <KV k="Зарядный FET">
              <OnOffChip value={boolChip(bms?.charge_fet)} />
            </KV>
            <KV k="Разрядный FET">
              <OnOffChip value={boolChip(bms?.discharge_fet)} />
            </KV>
            <KV k="Балансировка">
              <OnOffChip value={boolChip(bms?.balancing)} />
            </KV>
            <KV k="Режим работы">{str(bms?.operation)}</KV>
            <KV k="Код защиты">{fmt(bms?.protection, 0)}</KV>
            <KV k="Состояние защиты">{protectionLabel}</KV>
          </Card>

          {/* температуры */}
          <Card title="Датчики температуры (NTC)" icon={<Thermometer size={13} />} delay={190}>
            {bms?.temperatures && bms.temperatures.length > 0 ? (
              bms.temperatures.map((t, i) => (
                <KV key={i} k={`Датчик ${i + 1}`}>
                  {fmt(t, 1)} °C
                </KV>
              ))
            ) : (
              <EmptyState title="Нет данных NTC" hint="Массив temperatures[] не получен от BMS" compact />
            )}
            {bms?.ntc_count !== null && bms?.ntc_count !== undefined && (
              <div className="text-[10px] text-mut mt-1.5">
                ntc_count: <span className="num">{fmt(bms.ntc_count, 0)}</span>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ДИАГНОСТИКА JBD */}
      <Card title="Диагностика JBD" icon={<Shield size={13} />} delay={220} className="mt-3">
        {!diag ? (
          <EmptyState title="Диагностика JBD недоступна" hint="GET /api/bms не вернул блок diagnostics" compact />
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {(
                  [
                    ["Запросы", diag.requests],
                    ["Успешные", diag.successful],
                    ["Ошибки", diag.errors],
                    ["Тайм-ауты", diag.timeouts],
                    ["Ошибки CRC", diag.crc_errors],
                    ["Ошибки протокола", diag.protocol_errors],
                  ] as [string, unknown][]
                ).map(([label, v]) => (
                  <div key={label} className="rounded border border-line bg-panel2/70 px-2.5 py-2">
                    <div className="text-[9px] tracking-[0.12em] uppercase text-mut">{label}</div>
                    <div className="num font-semibold text-[16px] mt-0.5">{fmt(v, 0)}</div>
                  </div>
                ))}
              </div>
              <KV k="Базовая информация получена">
                <OnOffChip value={boolChip(diag.basic_ok)} />
              </KV>
              <KV k="Ячейки получены">
                <OnOffChip value={boolChip(diag.cells_ok)} />
              </KV>
              <KV k="Последняя ошибка">{str(diag.last_error)}</KV>
              <KV k="CRC последнего ответа">
                <OnOffChip value={boolChip(diag.last_crc_ok)} />
              </KV>
              <KV k="Длина последнего ответа">{fmt(diag.last_response_length, 0)}</KV>
            </div>
            <div className="space-y-3">
              <HexBlock label="Последний запрос (HEX)" value={diag.last_request_hex} />
              <HexBlock label="Последний ответ (HEX)" value={diag.last_response_hex} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
