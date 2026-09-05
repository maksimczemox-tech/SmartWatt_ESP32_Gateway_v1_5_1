/**
 * Централизованный Data Store приложения.
 * Цепочка: ESP32 Gateway → api.ts / websocket.ts → этот store → компоненты.
 * UI-компоненты не обращаются к API напрямую.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type BmsData,
  type ConnectionStatus,
  type EngineeringData,
  type HistoryPoint,
  type HistoryRange,
  type LogEntry,
  type RawData,
  type SessionCounters,
  type StatusData,
  type SubsystemState,
  type SystemData,
  type VersionData,
  type WifiData,
} from "../types";
import { api, httpStats } from "../services/api";
import { GatewaySocket } from "../services/websocket";
import { normTs, num, toBool } from "../utils/format";
import { useNow } from "../hooks/useNow";

/** Данные старше этого возраста считаются устаревшими (STALE). */
export const STALE_MS = 30_000;

const DATA_POLL_MS = 5_000;
const BMS_POLL_MS = 8_000;
const STATUS_POLL_MS = 10_000;

/** Ключи, по которым объект распознаётся как телеметрический фрейм. */
const TELEMETRY_KEYS: ReadonlyArray<keyof SystemData> = [
  "online",
  "timestamp",
  "dataAgeMs",
  "batterySOC",
  "batteryVoltage",
  "batteryCurrent",
  "pvVoltage",
  "pvCurrent",
  "pvPower",
  "chargePower",
  "loadVoltage",
  "loadCurrent",
  "loadPower",
  "loadState",
  "chargeState",
  "fault",
  "bmsOnline",
  "bmsSOC",
  "bmsCells",
  "totalChargeWh",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractTelemetry(payload: unknown): SystemData | null {
  if (!isRecord(payload)) return null;
  const inner = payload.data;
  const candidate = isRecord(inner) ? inner : payload;
  const hasTelemetryKey = TELEMETRY_KEYS.some((k) => k in candidate);
  return hasTelemetryKey ? (candidate as unknown as SystemData) : null;
}

function mergeTelemetry(prev: SystemData | null, next: SystemData): SystemData {
  /* Полный фрейм (есть timestamp/dataAgeMs) заменяет состояние целиком. */
  if (next.timestamp !== undefined || next.dataAgeMs !== undefined || prev === null) {
    return next;
  }
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined) out[k] = v;
  }
  return out as SystemData;
}

/* ---------------- нормализация ответов (только реальные поля) ---------------- */

export function normalizeHistory(res: unknown): HistoryPoint[] {
  let arr: unknown = null;
  if (Array.isArray(res)) arr = res;
  else if (isRecord(res)) {
    for (const key of ["points", "history", "samples", "data"]) {
      if (Array.isArray(res[key])) {
        arr = res[key];
        break;
      }
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: HistoryPoint[] = [];
  for (const item of arr) {
    if (!isRecord(item)) continue;
    const ts = normTs(item.ts ?? item.timestamp ?? item.time);
    if (ts === null) continue;
    out.push({
      ts,
      pv: "pv" in item ? (item.pv as number | null) : null,
      batt: "batt" in item ? (item.batt as number | null) : null,
      load: "load" in item ? (item.load as number | null) : null,
      soc: "soc" in item ? (item.soc as number | null) : null,
      valid: "valid" in item ? (item.valid as boolean | number | null) : null,
    });
  }
  return out;
}

export function normalizeLogs(res: unknown): LogEntry[] {
  let arr: unknown = null;
  if (Array.isArray(res)) arr = res;
  else if (isRecord(res)) {
    for (const key of ["logs", "entries", "lines", "data"]) {
      if (Array.isArray(res[key])) {
        arr = res[key];
        break;
      }
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: LogEntry[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      out.push({ text: item });
      continue;
    }
    if (isRecord(item)) {
      const raw = item.msg ?? item.message ?? item.text ?? item.line ?? item.log;
      const text = typeof raw === "string" ? raw : raw === undefined || raw === null ? null : String(raw);
      if (text === null) continue;
      const levelRaw = item.level ?? item.lvl;
      out.push({
        text,
        ts: normTs(item.ts ?? item.time ?? item.timestamp),
        level: typeof levelRaw === "string" || typeof levelRaw === "number" ? String(levelRaw) : null,
      });
    }
  }
  return out;
}

/* ---------------- контекст ---------------- */

interface DataContextValue {
  conn: ConnectionStatus;
  wsOpen: boolean;
  lastUpdate: number | null;
  dataAge: number | null;
  data: SystemData | null;
  bms: BmsData | null;
  status: StatusData | null;
  version: VersionData | null;
  rebooting: boolean;
  showSources: boolean;
  counters: SessionCounters;
  bmsState: SubsystemState;
  controllerState: SubsystemState;

  fetchHistory: (range: HistoryRange) => Promise<HistoryPoint[]>;
  fetchEngineering: () => Promise<EngineeringData>;
  fetchLogs: () => Promise<LogEntry[]>;
  clearLogs: () => Promise<void>;
  fetchRaw: () => Promise<RawData>;
  fetchWifi: () => Promise<WifiData>;
  saveWifi: (ssid: string, password: string) => Promise<void>;
  reboot: () => Promise<void>;
  resetDiagnostics: () => Promise<void>;
  refreshTelemetry: () => Promise<void>;
  setShowSources: (v: boolean) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SystemData | null>(null);
  const [bms, setBms] = useState<BmsData | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [version, setVersion] = useState<VersionData | null>(null);
  const [rawConn, setRawConn] = useState<ConnectionStatus>("CONNECTING");
  const [wsOpen, setWsOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [rebooting, setRebooting] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const failsRef = useRef(0);
  const everOnlineRef = useRef(false);
  const versionDoneRef = useRef(false);
  const wsOpenRef = useRef(false);
  wsOpenRef.current = wsOpen;

  const now = useNow(1000);

  const applyHttpFailure = useCallback(() => {
    failsRef.current += 1;
    if (!everOnlineRef.current) {
      setRawConn(failsRef.current >= 3 ? "OFFLINE" : "CONNECTING");
      return;
    }
    setRawConn(failsRef.current >= 3 ? "OFFLINE" : "RECONNECTING");
  }, []);

  const applyHttpSuccess = useCallback(() => {
    failsRef.current = 0;
    everOnlineRef.current = true;
    setRebooting(false);
    setRawConn("ONLINE");
    setLastUpdate(Date.now());
  }, []);

  const pollData = useCallback(async () => {
    try {
      const d = await api.get<unknown>("/api/data");
      if (!isRecord(d)) throw new Error("Unexpected /api/data payload");
      setData(mergeTelemetry(null, d as unknown as SystemData));
      applyHttpSuccess();
      if (!versionDoneRef.current) {
        versionDoneRef.current = true;
        api
          .get<VersionData>("/api/version")
          .then((v) => setVersion(v))
          .catch(() => undefined);
      }
    } catch {
      applyHttpFailure();
    }
  }, [applyHttpFailure, applyHttpSuccess]);

  const pollBms = useCallback(async () => {
    try {
      const b = await api.get<unknown>("/api/bms");
      if (isRecord(b)) setBms(b as unknown as BmsData);
    } catch {
      /* при ошибке предыдущее значение сохраняется, статус меняется через pollData */
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const s = await api.get<unknown>("/api/status");
      if (isRecord(s)) setStatus(s as unknown as StatusData);
    } catch {
      /* noop */
    }
  }, []);

  /* ---------------- polling (HTTP fallback / источники конфигурации) ---------------- */

  useEffect(() => {
    void pollData();
    void pollBms();
    void pollStatus();
    const t1 = window.setInterval(() => void pollData(), DATA_POLL_MS);
    const t2 = window.setInterval(() => void pollBms(), BMS_POLL_MS);
    const t3 = window.setInterval(() => void pollStatus(), STATUS_POLL_MS);
    return () => {
      window.clearInterval(t1);
      window.clearInterval(t2);
      window.clearInterval(t3);
    };
  }, [pollData, pollBms, pollStatus]);

  /* ---------------- WebSocket realtime (порт 81) ---------------- */

  useEffect(() => {
    const sock = new GatewaySocket();
    sock.onState = (s) => setWsOpen(s === "open");
    sock.onMessage = (payload) => {
      const frame = extractTelemetry(payload);
      if (!frame) return;
      setData((prev) => mergeTelemetry(prev, frame));
      failsRef.current = 0;
      everOnlineRef.current = true;
      setRebooting(false);
      setRawConn("ONLINE");
      setLastUpdate(Date.now());
    };
    sock.connect();
    return () => sock.close();
  }, []);

  /* ---------------- производные значения ---------------- */

  const dataAge = useMemo<number | null>(() => {
    const reported = num(data?.dataAgeMs);
    if (reported !== null) return reported;
    if (lastUpdate !== null) return Math.max(0, now - lastUpdate);
    return null;
  }, [data?.dataAgeMs, lastUpdate, now]);

  const conn = useMemo<ConnectionStatus>(() => {
    if (rebooting && rawConn !== "ONLINE") return "RECONNECTING";
    if (rawConn === "ONLINE") {
      if (dataAge !== null && dataAge > STALE_MS) return "STALE";
      return "ONLINE";
    }
    if (rawConn === "OFFLINE" && wsOpen && lastUpdate !== null && now - lastUpdate < 5000) {
      return "ONLINE";
    }
    return rawConn;
  }, [rawConn, rebooting, dataAge, wsOpen, lastUpdate, now]);

  const bmsState = useMemo<SubsystemState>(() => {
    const b = toBool(data?.bmsOnline) ?? toBool(bms?.online);
    if (b === null) return "NO_DATA";
    return b ? "ONLINE" : "OFFLINE";
  }, [data?.bmsOnline, bms?.online]);

  const controllerState = useMemo<SubsystemState>(() => {
    const modbusFields = [
      data?.pvVoltage,
      data?.pvCurrent,
      data?.pvPower,
      data?.chargePower,
      data?.loadVoltage,
      data?.loadCurrent,
      data?.loadPower,
    ];
    if (modbusFields.some((v) => num(v) !== null)) return "ONLINE";
    if (rawConn === "OFFLINE") return "OFFLINE";
    return "NO_DATA";
  }, [data, rawConn]);

  const counters = useMemo<SessionCounters>(
    () => ({ requests: httpStats.requests, errors: httpStats.errors }),
    // счётчики перечитываются на каждом тике провайдера (1 c)
    [now],
  );

  /* ---------------- действия (единственный путь UI → Gateway) ---------------- */

  const fetchHistory = useCallback(async (range: HistoryRange) => {
    const path = range === "7d" ? "/api/history?range=7d" : "/api/history";
    const res = await api.get<unknown>(path);
    return normalizeHistory(res);
  }, []);

  const fetchEngineering = useCallback(async () => {
    const res = await api.get<unknown>("/api/engineering");
    if (!isRecord(res)) throw new Error("Unexpected /api/engineering payload");
    return res as EngineeringData;
  }, []);

  const fetchLogs = useCallback(async () => {
    const res = await api.get<unknown>("/api/logs");
    return normalizeLogs(res);
  }, []);

  const clearLogs = useCallback(async () => {
    await api.post("/api/logs/clear");
  }, []);

  const fetchRaw = useCallback(async () => {
    const res = await api.get<unknown>("/api/raw");
    if (!isRecord(res)) throw new Error("Unexpected /api/raw payload");
    return res as RawData;
  }, []);

  const fetchWifi = useCallback(async () => {
    const res = await api.get<unknown>("/api/wifi");
    if (!isRecord(res)) throw new Error("Unexpected /api/wifi payload");
    return res as WifiData;
  }, []);

  const saveWifi = useCallback(async (ssid: string, password: string) => {
    await api.post("/api/wifi", { ssid, password });
  }, []);

  const reboot = useCallback(async () => {
    setRebooting(true);
    try {
      await api.post("/api/reboot");
    } finally {
      /* Gateway уходит в перезагрузку — статус восстановится через polling */
      void pollData();
    }
  }, [pollData]);

  const resetDiagnostics = useCallback(async () => {
    await api.post("/api/diagnostics/reset");
    await Promise.allSettled([pollStatus(), pollBms(), pollData()]);
  }, [pollStatus, pollBms, pollData]);

  const refreshTelemetry = useCallback(async () => {
    await Promise.allSettled([pollData(), pollBms(), pollStatus()]);
  }, [pollData, pollBms, pollStatus]);

  const value = useMemo<DataContextValue>(
    () => ({
      conn,
      wsOpen,
      lastUpdate,
      dataAge,
      data,
      bms,
      status,
      version,
      rebooting,
      showSources,
      counters,
      bmsState,
      controllerState,
      fetchHistory,
      fetchEngineering,
      fetchLogs,
      clearLogs,
      fetchRaw,
      fetchWifi,
      saveWifi,
      reboot,
      resetDiagnostics,
      refreshTelemetry,
      setShowSources,
    }),
    [
      conn,
      wsOpen,
      lastUpdate,
      dataAge,
      data,
      bms,
      status,
      version,
      rebooting,
      showSources,
      counters,
      bmsState,
      controllerState,
      fetchHistory,
      fetchEngineering,
      fetchLogs,
      clearLogs,
      fetchRaw,
      fetchWifi,
      saveWifi,
      reboot,
      resetDiagnostics,
      refreshTelemetry,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
