import { useEffect, useState } from "react";
import {
  Braces,
  CircuitBoard,
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
  Metric,
  SectionTitle,
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
    data,
    bms,
    status,
    showSources,
    setShowSources,
    fetchEngineering,
    fetchRaw,
    fetchLogs,
    fetchConfig,
    clearLogs,
    resetDiagnostics,
  } = useData();

  const [eng, setEng] = useState<EngineeringData | null>(null);
  const [raw, setRaw] = useState<RawData | null>(null);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [cfg, setCfg] = useState<Record<string, unknown> | null>(null);
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
    Promise.allSettled([fetchEngineering(), fetchRaw(), fetchLogs(), fetchConfig()]).then((res) => {
      setEng(res[0].status === "fulfilled" ? res[0].value : null);
      if (res[1].status === "fulfilled") setRaw(res[1].value);
      else setRawErr(true);
      if (res[2].status === "fulfilled") setLogs(res[2].value);
      else setLogsErr(true);
      setCfg(res[3].status === "fulfilled" ? res[3].value : null);
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
        setNote("Журнал очищен (POST /api/logs/clear)");
        setConfirmClear(false);
        return fetchLogs().then(setLogs).catch(() => setLogs([]));
      })
      .catch(() => setNote("Не удалось очистить журнал (POST /api/logs/clear)"))
      .finally(() => setBusyClear(false));
  };

  const doResetDiag = () => {
    setBusyReset(true);
    resetDiagnostics()
      .then(() => {
        setNote("Счётчики диагностики сброшены, данные обновлены с Gateway");
        setConfirmReset(false);
        loadAll();
      })
      .catch(() => setNote("Не удалось сбросить диагностику (POST /api/diagnostics/reset)"))
      .finally(() => setBusyReset(false));
  };

  const esp = findSection(eng, ["esp32", "system", "chip", "device"]);
  const wifiSec = findSection(eng, ["wifi", "wi-fi", "network"]);
  const modbus = findSection(eng, ["modbus", "mppt"]);
  const jbd = findSection(eng, ["jbd", "bms"]);
  const memory = findSection(eng, ["memory", "heap", "ram", "psram"]);
  const diagSec = findSection(eng, ["diagnostics", "diag", "stats"]);

  const bmsLive: [string, unknown][] | null = bms
    ? [
        ["online", bms.online ?? null],
        ["data_age_ms", bms.data_age_ms ?? null],
        ["voltage", bms.voltage ?? null],
        ["current", bms.current ?? null],
        ["soc", bms.soc ?? null],
        ["cell_count", bms.cell_count ?? null],
        ["ntc_count", bms.ntc_count ?? null],
        ["protection_text", bms.protection_text ?? null],
      ]
    : null;
  const bmsSec = findSection(eng, ["bms"]) ?? bmsLive;

  const diagRows: [string, unknown][] = [
    ["Ошибки Modbus", status?.modbus_errors ?? null],
    ["Повторные попытки Modbus", status?.modbus_retries ?? null],
    ["Последняя ошибка Modbus", status?.last_modbus_error ?? null],
    ["Запросы JBD", bms?.diagnostics?.requests ?? status?.bms_requests ?? null],
    ["Успешные запросы JBD", bms?.diagnostics?.successful ?? null],
    ["Ошибки JBD", bms?.diagnostics?.errors ?? status?.bms_errors ?? null],
    ["Тайм-ауты JBD", bms?.diagnostics?.timeouts ?? null],
    ["Ошибки CRC", bms?.diagnostics?.crc_errors ?? null],
    ["Ошибки протокола", bms?.diagnostics?.protocol_errors ?? null],
    ["Последняя ошибка JBD", bms?.diagnostics?.last_error ?? null],
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
          title="Показывать источник каждого значения (endpoint и поле backend)"
          className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors ${
            showSources ? "bg-acc/15 border-acc/60 text-acc2" : "bg-panel2 border-line text-mut hover:text-ink"
          }`}
        >
          <span className={`w-[7px] h-[7px] rounded-full ${showSources ? "bg-acc2 led" : "bg-line2"}`} style={{ color: "#2F9BE8" }} />
          Источники данных: {showSources ? "вкл" : "выкл"}
        </button>
        {note && <span className="text-[11px] text-ok">{note}</span>}
        <span className="ml-auto num text-[10px] text-mut hidden lg:inline">
          Источники: /api/engineering · /api/raw · /api/logs · /api/status · /api/bms
        </span>
      </div>

      {/* происхождение ключевых параметров */}
      <Card title="Происхождение ключевых параметров" icon={<Wrench size={13} />} delay={0} className="mb-3">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Metric label="Напряжение батареи" value={data?.batteryVoltage} digits={2} unitStr="V" source="/api/data · batteryVoltage" />
          <Metric label="Мощность батареи" value={data?.bmsPower} digits={1} unitStr="W" source="/api/data · bmsPower" sub={<span>источник: BMS</span>} />
          <Metric label="Напряжение BMS" value={bms?.voltage} digits={2} unitStr="V" source="/api/bms · voltage" />
          <Metric label="Мощность PV" value={data?.pvPower} digits={1} unitStr="W" source="/api/data · pvPower" />
          <Metric
            label="loadPower контроллера"
            value={data?.loadPower}
            digits={1}
            unitStr="W"
            source="/api/data · loadPower"
            sub={<span className="text-warn/90">Поле контроллера — не используется для расчёта нагрузки</span>}
          />
          <Metric label="Заряд (SOC)" value={data?.batterySOC} digits={1} unitStr="%" source="/api/data · batterySOC" />
        </div>
        <p className="text-[10.5px] text-mut/70 mt-2.5">
          Переключатель «Источники данных» добавляет к каждому значению подпись с endpoint и полем backend —
          для сверки интерфейса с реальным Gateway.
        </p>
      </Card>

      {/* правило расчёта нагрузки */}
      <div className="reveal rounded-lg border border-line bg-panel px-3.5 py-3 mb-3">
        <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">Расчёт нагрузки</div>
        <div className="grid sm:grid-cols-3 gap-3 text-[11.5px]">
          <div>
            <div className="text-mut">Основной расчёт</div>
            <div className="num text-ink mt-0.5">Расчётная нагрузка = max(0, PV − АКБ)</div>
          </div>
          <div>
            <div className="text-mut">Поле контроллера</div>
            <div className="num text-ink mt-0.5">
              loadPower <span className="text-warn">— не используется для расчёта нагрузки</span>
            </div>
          </div>
          <div>
            <div className="text-mut">Причина</div>
            <div className="text-ink/85 mt-0.5">Нагрузка подключена к аккумулятору, а не к выходу LOAD контроллера</div>
          </div>
        </div>
      </div>

      {/* секции engineering */}
      <SectionTitle>Разделы GET /api/engineering</SectionTitle>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        <SectionCard title="ESP32" icon={<Cpu size={13} />} entries={esp} delay={0} />
        <SectionCard title="Wi-Fi" icon={<Wifi size={13} />} entries={wifiSec} delay={40} />
        <SectionCard title="Modbus" icon={<Radio size={13} />} entries={modbus} delay={80} />
        <SectionCard title="BMS" icon={<CircuitBoard size={13} />} entries={bmsSec} delay={100} hint="Блок bms отсутствует в /api/engineering, показаны живые данные /api/bms" />
        <SectionCard title="JBD" icon={<Braces size={13} />} entries={jbd} delay={120} />
        <SectionCard title="Память" icon={<MemoryStick size={13} />} entries={memory} delay={160} />

        {/* ДИАГНОСТИКА */}
        <Card title="Диагностика" icon={<Shield size={13} />} delay={200}>
          {diagRows.map(([k, v]) => (
            <KV key={k} k={k}>
              {typeof v === "number" ? fmt(v, 0) : str(v)}
            </KV>
          ))}
          {diagSec && diagSec.length > 0 && (
            <>
              <div className="text-[9px] tracking-[0.14em] uppercase text-mut mt-2.5 mb-1">Из /api/engineering</div>
              {diagSec.map(([k, v]) => (
                <KV key={`d-${k}`} k={k}>
                  <EntryValue v={v} />
                </KV>
              ))}
            </>
          )}
          <div className="mt-3">
            <Btn tone="danger" onClick={() => setConfirmReset(true)}>
              <RefreshCw size={12} />
              Сбросить диагностику
            </Btn>
          </div>
        </Card>
      </div>

      {/* СЫРЫЕ ДАННЫЕ (RAW MODBUS) */}
      <Card
        title="Сырые данные · GET /api/raw"
        icon={<FileText size={13} />}
        delay={240}
        className="mt-3"
        right={
          <IconBtn title="Обновить (GET /api/raw)" onClick={loadAll} busy={loading}>
            <RefreshCw size={12} />
          </IconBtn>
        }
      >
        {rawErr && raw === null ? (
          <EmptyState title="Сырые данные недоступны" hint="GET /api/raw не ответил" compact />
        ) : raw === null ? (
          <div className="text-[11.5px] text-mut py-2">Ожидание данных...</div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <KV k="ID устройства (slave)">{fmt(raw.slave_id, 0)}</KV>
              <KV k="Функция">{str(raw.function)}</KV>
              <KV k="Начальный регистр">{fmt(raw.start_register, 0)}</KV>
              <KV k="Количество регистров">{fmt(raw.register_count, 0)}</KV>
              <KV k="CRC последнего ответа">
                <OnOffChip value={boolChip(raw.last_response_crc_ok)} />
              </KV>
              <KV k="Длина последнего ответа">{fmt(raw.last_response_length, 0)}</KV>
              <KV k="Последняя ошибка Modbus">{str(raw.last_modbus_error)}</KV>
              <div className="mt-3">
                <div className="text-[9.5px] tracking-[0.16em] uppercase text-mut mb-1.5">Регистры</div>
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
              <HexLine label="Запрос (HEX)" value={raw.request_hex} />
              <HexLine label="Ответ (HEX)" value={raw.response_hex} />
            </div>
            <div className="lg:col-span-2 mt-1">
              <JsonViewer data={raw} maxH={220} />
            </div>
          </div>
        )}
      </Card>

      {/* ЖУРНАЛ */}
      <Card
        title="Журнал · ESP32"
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
              Очистить журнал
            </Btn>
          </div>
        }
      >
        {logsErr && logs === null ? (
          <EmptyState title="Журнал недоступен" hint="GET /api/logs не ответил" compact />
        ) : logs === null ? (
          <div className="text-[11.5px] text-mut py-2">Ожидание данных...</div>
        ) : logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="Журнал пуст" hint="Gateway не вернул записей" compact />
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
        <Card title="Полный ответ /api/engineering" icon={<Wrench size={13} />} delay={320} className="mt-3">
          <JsonViewer data={eng} maxH={300} />
        </Card>
      )}

      {/* конфигурация */}
      {cfg !== null && (
        <Card title="Конфигурация · GET /api/config" icon={<Braces size={13} />} delay={340} className="mt-3">
          <JsonViewer data={cfg} maxH={260} />
        </Card>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Очистить журнал?"
        body="Все записи журнала на ESP32 Gateway будут удалены (POST /api/logs/clear). Действие необратимо."
        confirmLabel="Очистить"
        busy={busyClear}
        onCancel={() => setConfirmClear(false)}
        onConfirm={doClearLogs}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Сбросить счётчики диагностики?"
        body="Счётчики диагностики (Modbus / JBD / CRC / тайм-ауты) на Gateway будут сброшены (POST /api/diagnostics/reset). После сброса данные будут повторно получены с backend."
        confirmLabel="Сбросить"
        busy={busyReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={doResetDiag}
      />
    </div>
  );
}
