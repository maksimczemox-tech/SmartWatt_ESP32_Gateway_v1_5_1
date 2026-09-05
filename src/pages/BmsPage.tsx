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
        {s !== "—" && <CopyBtn getText={() => s} label="Copy" />}
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

  return (
    <div>
      {/* телеметрия JBD BMS */}
      <Card
        title="BMS · JBD Телеметрия"
        icon={<CircuitBoard size={13} />}
        delay={0}
        right={
          <div className="flex items-center gap-3">
            <span className="num text-[10px] text-mut">cells {fmt(bms?.cell_count, 0)} · ntc {fmt(bms?.ntc_count, 0)}</span>
            <SubsystemChip state={bmsState} />
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <Metric label="Voltage" value={bms?.voltage} digits={2} unitStr="V" size="lg" source="/api/bms · voltage" />
          <Metric label="Current" value={bms?.current} digits={2} unitStr="A" sign source="/api/bms · current" />
          <Metric label="Power" value={bms?.power} digits={1} unitStr="W" sign source="/api/bms · power" />
          <Metric label="SOC" value={bms?.soc} digits={0} unitStr="%" tone="ok" source="/api/bms · soc" />
          <Metric label="Remaining" value={bms?.remaining_ah} digits={1} unitStr="Ah" source="/api/bms · remaining_ah" />
          <Metric label="Full Capacity" value={bms?.full_capacity_ah} digits={1} unitStr="Ah" source="/api/bms · full_capacity_ah" />
          <Metric label="Cycles" value={bms?.cycles} digits={0} source="/api/bms · cycles" />
        </div>
        <div className="mt-2.5 pt-2 border-t border-line/60 flex items-center gap-4 text-[11px] text-mut">
          <span>
            Data age: <span className="num text-ink">{age(bms?.data_age_ms)}</span>
          </span>
          <span>
            Protection: <span className="num text-ink">{fmt(bms?.protection, 0)}</span>
          </span>
          <span className="truncate">{str(bms?.protection_text) !== "—" ? str(bms?.protection_text) : "Unknown protection / fault"}</span>
        </div>
      </Card>

      <div className="grid xl:grid-cols-3 gap-3 mt-3">
        {/* ячейки */}
        <Card
          title={`Cell Voltage${bms?.cells ? ` · ${bms.cells.length}` : ""}`}
          icon={<Cpu size={13} />}
          className="xl:col-span-2"
          delay={60}
        >
          <CellsGrid bms={bms} />
        </Card>

        <div className="space-y-3">
          {/* FET / operation */}
          <Card title="FET / Operation" icon={<Activity size={13} />} delay={110}>
            <KV k="Charge FET">
              <OnOffChip value={boolChip(bms?.charge_fet)} />
            </KV>
            <KV k="Discharge FET">
              <OnOffChip value={boolChip(bms?.discharge_fet)} />
            </KV>
            <KV k="Balancing">
              <OnOffChip value={boolChip(bms?.balancing)} />
            </KV>
            <KV k="Operation">{str(bms?.operation)}</KV>
            <KV k="Protection code">{fmt(bms?.protection, 0)}</KV>
            <KV k="Protection text">
              {str(bms?.protection_text) !== "—" ? str(bms?.protection_text) : "Unknown protection / fault"}
            </KV>
          </Card>

          {/* температуры */}
          <Card title="Temperatures · NTC" icon={<Thermometer size={13} />} delay={160}>
            {bms?.temperatures && bms.temperatures.length > 0 ? (
              bms.temperatures.map((t, i) => (
                <KV key={i} k={`NTC ${i + 1}`}>
                  {fmt(t, 1)} °C
                </KV>
              ))
            ) : (
              <EmptyState title="Нет данных NTC" hint="temperatures[] не получен" compact />
            )}
            {bms?.ntc_count !== null && bms?.ntc_count !== undefined && (
              <div className="text-[10px] text-mut mt-1.5">ntc_count: <span className="num">{fmt(bms.ntc_count, 0)}</span></div>
            )}
          </Card>
        </div>
      </div>

      {/* JBD DIAGNOSTICS */}
      <Card title="JBD Diagnostics" icon={<Shield size={13} />} delay={200} className="mt-3">
        {!diag ? (
          <EmptyState title="Диагностика JBD недоступна" hint="GET /api/bms не вернул блок diagnostics" compact />
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {(
                  [
                    ["Requests", diag.requests],
                    ["Successful", diag.successful],
                    ["Errors", diag.errors],
                    ["Timeouts", diag.timeouts],
                    ["CRC Errors", diag.crc_errors],
                    ["Protocol Err", diag.protocol_errors],
                  ] as [string, unknown][]
                ).map(([label, v]) => (
                  <div key={label} className="rounded border border-line bg-panel2/70 px-2.5 py-2">
                    <div className="text-[9px] tracking-[0.14em] uppercase text-mut">{label}</div>
                    <div className="num font-semibold text-[16px] mt-0.5">{fmt(v, 0)}</div>
                  </div>
                ))}
              </div>
              <KV k="Basic info OK">
                <OnOffChip value={boolChip(diag.basic_ok)} />
              </KV>
              <KV k="Cells OK">
                <OnOffChip value={boolChip(diag.cells_ok)} />
              </KV>
              <KV k="Last error">{str(diag.last_error)}</KV>
              <KV k="Last CRC OK">
                <OnOffChip value={boolChip(diag.last_crc_ok)} />
              </KV>
              <KV k="Last response length">{fmt(diag.last_response_length, 0)}</KV>
            </div>
            <div className="space-y-3">
              <HexBlock label="Last Request (hex)" value={diag.last_request_hex} />
              <HexBlock label="Last Response (hex)" value={diag.last_response_hex} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
