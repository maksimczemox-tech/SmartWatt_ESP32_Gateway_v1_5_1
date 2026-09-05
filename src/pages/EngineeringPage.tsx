import { useEffect, useState } from "react";
import {
  Braces,
  Cpu,
  FileText,
  MemoryStick,
  Radio,
  RefreshCw,
  ScrollText,
  Shield,
  Trash2,
  Wifi,
  Wrench,
} from "lucide-react";
import { useData } from "../store/DataContext";
import {
  Card,
  KV,
  Btn,
  IconBtn,
  ConfirmDialog,
  EmptyState,
  JsonViewer,
  OnOffChip,
  CopyBtn,
} from "../components/ui";
import type { EngineeringData, LogEntry, RawData } from "../types";
import { boolChip, fmt, fmtTime, normTs, str, toBool } from "../utils/format";

/* ---------------- разбор секций engineering ---------------- */

function findSection(eng: EngineeringData | null, names: string[]): [string, unknown][] | null {
  if (!eng) return null;
  const lower = new Map<string, unknown>(Object.entries(eng).map(([k, v]) => [k.toLowerCase(), v]));
  for (const n of names) {
    const v = lower.get(n);
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return Object.entries(v as Record<string, unknown>);
    }
  }
  for (const n of names) {
    const rows = Object.entries(eng).filter(([k]) => k.toLowerCase().startsWith(`${n}_`));
    if (rows.length > 0) return rows;
  }
  return null;
}

function EntryValue({ v }: { v: unknown }) {
  const b = toBool(v);
  if (b !== null && typeof v !== "number") return <OnOffChip value={b ? "ON" : "OFF"} />;
  if (typeof v === "number") return <span className="num">{fmt(v, Number.isInteger(v) ? 0 : 2)}</span>;
  if (typeof v === "boolean") return <OnOffChip value={v ? "ON" : "OFF"} />;
  if (v !== null && typeof v === "object") {
    return <span className="num text-[10.5px] text-mut">{JSON.stringify(v)}</span>;
  }
  return <>{str(v)}</>;
}

function SectionCard({
  title,
  icon,
  entries,
  delay,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  entries: [string, unknown][] | null;
  delay: number;
  hint?: string;
}) {
  return (
    <Card title={title} icon={icon} delay={delay}>
      {entries === null || entries.length === 0 ? (
        <EmptyState title="Раздел не предоставлен" hint={hint ?? "GET /api/engineering не содержит этот блок"} compact />
      ) : (
        entries.map(([k, v]) => (
          <KV key={k} k={k}>
            <EntryValue v={v} />
          </KV>
        ))
      )}
    </Card>
  );
}

function HexLine({ label, value }: { label: string; value: unknown }) {
  const s = str(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9.5px] tracking-[0.16em] uppercase text-mut">{label}</span>
        {s !== "—" && <CopyBtn getText={() => s} />}
      </div>
      <div className="hexblock bg-bg border border-line rounded p-2.5 text-acc2/90 min-h-[40px]">
        {s === "—" ? <span className="text-mut/70">—</span> : s}
      </div>
    </div>
  );
}

/* ---------------- страница ---------------- */

export function EngineeringPage() {
  const {
    status,
    bms,
    showSources,
    setShowSources,
    fetchEngineering,
    fetchRaw,
    fetchLogs,
    clearLogs,
    resetDiagnostics,
    refreshTelemetry,
  } = useData();

  const [eng, setEng] = useState<EngineeringData | null>(null);
  const [raw, setRaw] = useState<RawData | null>(null);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [rawErr, setRawErr] = useState(false);
  const [logsErr, setLogsErr] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busyClear, setBusyClear] = useState(false);
  const [busyReset, setBusyReset] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadAll = () => {
    setLoading(true);
    setRawErr(false);
    setLogsErr(false);
    Promise.allSettled([fetchEngineering(), fetchRaw(), fetchLogs()]).then((res) => {
      if (res[0].status === "fulfilled") setEng(res[0].value);
      else setEng(null);
      if (res[1].status === "fulfilled") setRaw(res[1].value);
      else setRawErr(true);
      if (res[2].status === "fulfilled") setLogs(res[2].value);
      else setLogsErr(true);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doClearLogs = () => {
    setBusyClear(true);
    clearLogs()
      .then(() => {
        setNote("Логи очищены (POST /api/logs/clear)");
        setConfirmClear(false);
        return fetchLogs().then(setLogs).catch(() => setLogs([]));
      })
      .catch(() => setNote("POST /api/logs/clear не выполнен"))
      .finally(() => setBusyClear(false));
  };

  const doResetDiag = () => {
    setBusyReset(true);
    resetDiagnostics()
      .then(() => {
        setNote("Диагностика сброшена, данные обновлены с Gateway");
        setConfirmReset(false);
        loadAll();
      })
      .catch(() => setNote("POST /api/diagnostics/reset не выполнен"))
      .finally(() => setBusyReset(false));
  };

  const esp = findSection(eng, ["esp32", "system", "chip", "device"]);
  const wifiSec = findSection(eng, ["wifi", "wi-fi", "network"]);
  const modbus = findSection(eng, ["modbus", "mppt"]);
  const jbd = findSection(eng, ["jbd", "bms"]);
  const memory = findSection(eng, ["memory", "heap", "ram"]);
  const diagSec = findSection(eng, ["diagnostics", "diag", "stats"]);

  const diagRows: [string, unknown][] = [
    ["Modbus Errors", status?.modbus_errors ?? null],
    ["Modbus Retries", status?.modbus_retries ?? null],
    ["Last Modbus Error", status?.last_modbus_error ?? null],
    ["JBD Requests", bms?.diagnostics?.requests ?? status?.bms_requests ?? null],
    ["JBD Errors", bms?.diagnostics?.errors ?? status?.bms_errors ?? null],
    ["JBD Timeouts", bms?.diagnostics?.timeouts ?? null],
    ["CRC Errors", bms?.diagnostics?.crc_errors ?? null],
    ["Protocol Errors", bms?.diagnostics?.protocol_errors ?? null],
  ];

  return (
    <div>
      {/* панель управления */}
      <div className="reveal flex items-center gap-2.5 flex-wrap mb-3">
        <Btn tone="primary" onClick={loadAll} busy={loading}>
          <RefreshCw size={12} />
          Обновить всё
        </Btn>
        <button
          type="button"
          onClick={() => setShowSources(!showSources)}
          className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors ${
            showSources ? "bg-acc/15 border-acc/60 text-acc2" : "bg-panel2 border-line text-mut hover:text-ink"
          }`}
        >
          <span className={`w-[7px] h-[7px] rounded-full ${showSources ? "bg-acc2 led" : "bg-line2"}`} style={{ color: "#2F9BE8" }} />
          Data sources {showSources ? "ON" : "OFF"}
        </button>
        {note && <span className="text-[11px] text-ok">{note}</span>}
        <span className="ml-auto num text-[10px] text-mut">Источники: /api/engineering · /api/raw · /api/logs · /api/status · /api/bms</span>
      </div>

      {/* секции engineering */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        <SectionCard title="ESP32" icon={<Cpu size={13} />} entries={esp} delay={0} />
        <SectionCard title="Wi-Fi" icon={<Wifi size={13} />} entries={wifiSec} delay={40} />
        <SectionCard title="Modbus" icon={<Radio size={13} />} entries={modbus} delay={80} />
        <SectionCard title="JBD" icon={<Braces size={13} />} entries={jbd} delay={120} />
        <SectionCard title="Memory" icon={<MemoryStick size={13} />} entries={memory} delay={160} />

        {/* DIAGNOSTICS */}
        <Card title="Diagnostics" icon={<Shield size={13} />} delay={200}>
          {diagRows.map(([k, v]) => (
            <KV key={k} k={k}>
              {typeof v === "number" ? fmt(v, 0) : str(v)}
            </KV>
          ))}
          <div className="mt-3">
            <Btn tone="danger" onClick={() => setConfirmReset(true)}>
              <RefreshCw size={12} />
              Reset Diagnostics
            </Btn>
          </div>
        </Card>
      </div>

      {/* RAW MODBUS */}
      <Card
        title="Raw Modbus · GET /api/raw"
        icon={<FileText size={13} />}
        delay={240}
        className="mt-3"
        right={<IconBtn title="Обновить (GET /api/raw)" onClick={loadAll} busy={loading}><RefreshCw size={12} /></IconBtn>}
      >
        {rawErr && raw === null ? (
          <EmptyState title="RAW MODBUS недоступен" hint="GET /api/raw не ответил" compact />
        ) : raw === null ? (
          <div className="text-[11.5px] text-mut py-2">Загрузка…</div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <KV k="Slave ID">{fmt(raw.slave_id, 0)}</KV>
              <KV k="Function">{str(raw.function)}</KV>
              <KV k="Start register">{fmt(raw.start_register, 0)}</KV>
              <KV k="Register count">{fmt(raw.register_count, 0)}</KV>
              <KV k="Last response CRC OK">
                <OnOffChip value={boolChip(raw.last_response_crc_ok)} />
              </KV>
              <KV k="Last response length">{fmt(raw.last_response_length, 0)}</KV>
              <KV k="Last Modbus error">{str(raw.last_modbus_error)}</KV>
              <div className="mt-3">
                <div className="text-[9.5px] tracking-[0.16em] uppercase text-mut mb-1.5">Registers</div>
                {Array.isArray(raw.registers) && raw.registers.length > 0 ? (
                  <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(74px, 1fr))" }}>
                    {(raw.registers as unknown[]).map((r, i) => {
                      const v = typeof r === "object" && r !== null ? (r as { value?: unknown }).value : r;
                      return (
                        <div key={i} className="rounded border border-line bg-panel2/70 px-1.5 py-1 text-center">
                          <div className="text-[8.5px] text-mut num">[{i}]</div>
                          <div className="num text-[12px] text-ink">{fmt(v, 0)}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-mut/70">—</div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <HexLine label="Request (hex)" value={raw.request_hex} />
              <HexLine label="Response (hex)" value={raw.response_hex} />
            </div>
            <div className="lg:col-span-2 mt-1">
              <JsonViewer data={raw} maxH={220} />
            </div>
          </div>
        )}
      </Card>

      {/* LOGS */}
      <Card
        title="Logs · ESP32"
        icon={<ScrollText size={13} />}
        delay={280}
        className="mt-3"
        right={
          <div className="flex items-center gap-2">
            <IconBtn title="Обновить (GET /api/logs)" onClick={loadAll} busy={loading}>
              <RefreshCw size={12} />
            </IconBtn>
            <Btn tone="danger" onClick={() => setConfirmClear(true)}>
              <Trash2 size={12} />
              Clear Logs
            </Btn>
          </div>
        }
      >
        {logsErr && logs === null ? (
          <EmptyState title="Логи недоступны" hint="GET /api/logs не ответил" compact />
        ) : logs === null ? (
          <div className="text-[11.5px] text-mut py-2">Загрузка…</div>
        ) : logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="Логи пусты" hint="Gateway не вернул записей" compact />
        ) : (
          <div className="max-h-[340px] overflow-y-auto rounded border border-line bg-bg p-2 space-y-[3px]">
            {logs.map((l, i) => {
              const lvl = (l.level ?? "").toUpperCase();
              const color = lvl.startsWith("E") ? "#FF3D32" : lvl.startsWith("W") ? "#FFC400" : lvl.startsWith("I") ? "#2F9BE8" : "#8A969F";
              return (
                <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                  {l.ts !== null && l.ts !== undefined && (
                    <span className="num text-mut/70 shrink-0">{fmtTime(normTs(l.ts))}</span>
                  )}
                  {l.level !== null && (
                    <span className="num shrink-0 w-4 text-center font-semibold" style={{ color }}>
                      {lvl.slice(0, 1) || "•"}
                    </span>
                  )}
                  <span className="num text-ink/85 break-all min-w-0">{l.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* инженерный дамп */}
      {eng !== null && (
        <Card title="Engineering · полный ответ /api/engineering" icon={<Wrench size={13} />} delay={320} className="mt-3">
          <JsonViewer data={eng} maxH={300} />
        </Card>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear Logs?"
        body="Все записи логов на ESP32 Gateway будут удалены (POST /api/logs/clear). Действие необратимо."
        confirmLabel="Очистить"
        busy={busyClear}
        onCancel={() => setConfirmClear(false)}
        onConfirm={doClearLogs}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Reset Diagnostics?"
        body="Счётчики диагностики (Modbus / JBD / CRC / timeouts) на Gateway будут сброшены (POST /api/diagnostics/reset). После сброса данные будут обновлены с backend."
        confirmLabel="Сбросить"
        busy={busyReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={doResetDiag}
      />
    </div>
  );
}
