/**
 * Централизованный Data Store приложения.
 *
 * Цепочка данных:
 *   ESP32 → HTTP API / WebSocket → Validation (services/validation.ts)
 *         → Normalized Store (этот модуль) → React UI
 *
 * UI-компоненты не обращаются к API и не обрабатывают сырые ответы.
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
import {
  extractTelemetry,
  isRecord,
  normalizeHistory,
  normalizeLogs,
  validateBmsData,
  validateStatusData,
  validateSystemData,
} from "../services/validation";
import { normTs, num, toBool } from "../utils/format";
import { useNow } from "../hooks/useNow";

/**
 * Единая конфигурационная константа актуальности данных.
 * Данные старше этого возраста считаются устаревшими (ДАННЫЕ УСТАРЕЛИ).
 * Используется и для Gateway, и для BMS — порог не дублируется.
 */
export const STALE_MS = 30_000;

const DATA_POLL_MS = 5_000;
const BMS_POLL_MS = 8_000;
const STATUS_POLL_MS = 10_000;

function mergeTelemetry(prev: SystemData | null, next: SystemData): SystemData {
  /* Полный фрейм (есть timestamp/dataAgeMs) заменяет состояние целиком. */
  if (next.timestamp !== null && next.timestamp !== undefined) return next;
  if (next.dataAgeMs !== null && next.dataAgeMs !== undefined) return next;
  if (prev === null) return next;
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as SystemData;
}

/* ---------------- контекст ---------------- */

interface DataContextValue {
  conn: ConnectionStatus;
  wsOpen: boolean;
  /** Время получения данных браузером (не время измерения!). */
  receivedAt: number | null;
  /** Время измерения ESP32 (поле timestamp из backend). */
  measureTs: number | null;
  /** Возраст данных: предпочтительно backend dataAgeMs, иначе now − receivedAt. */
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
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [rebooting, setRebooting] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const failsRef = useRef(0);
  const everOnlineRef = useRef(false);
  const versionDoneRef = useRef(false);

  const now = useNow(1000);

  const applyHttpFailure = useCallback(() => {
    failsRef.current += 1;
    if (!everOnlineRef.current) {
      setRawConn(failsRef.current >= 3 ? "OFFLINE" : "CONNECTING");
      return;
    }
    setRawConn(failsRef.current >= 3 ? "OFFLINE" : "RECONNECTING");
  }, []);

  const applyDataReceived = useCallback(() => {
    failsRef.current = 0;
    everOnlineRef.current = true;
    setRebooting(false);
    setRawConn("ONLINE");
    setReceivedAt(Date.now());
  }, []);

  const pollData = useCallback(async () => {
    try {
      const d = await api.get<unknown>("/api/data");
      const validated = validateSystemData(d);
      if (validated === null) throw new Error("Некорректный ответ /api/data");
      setData((prev) => mergeTelemetry(prev, validated));
      applyDataReceived();
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
  }, [applyHttpFailure, applyDataReceived]);

  const pollBms = useCallback(async () => {
    try {
      const b = await api.get<unknown>("/api/bms");
      const validated = validateBmsData(b);
      if (validated !== null) setBms(validated);
    } catch {
      /* предыдущее значение сохраняется; статус определяется по свежести */
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const s = await api.get<unknown>("/api/status");
      const validated = validateStatusData(s);
      if (validated !== null) setStatus(validated);
    } catch {
      /* noop */
    }
  }, []);

  /* ---------------- polling (HTTP: первичное состояние и fallback) ---------------- */

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
      if (frame === null) return;
      setData((prev) => mergeTelemetry(prev, frame));
      applyDataReceived();
    };
    sock.connect();
    return () => sock.close();
  }, [applyDataReceived]);

  /* ---------------- производные значения ---------------- */

  /** Время измерения оборудования — только из поля timestamp backend. */
  const measureTs = useMemo(() => normTs(data?.timestamp), [data?.timestamp]);

  /** Возраст данных: реальное dataAgeMs от Gateway, иначе оценка по времени получения. */
  const dataAge = useMemo<number | null>(() => {
    const reported = num(data?.dataAgeMs);
    if (reported !== null) return reported;
    if (receivedAt !== null) return Math.max(0, now - receivedAt);
    return null;
  }, [data?.dataAgeMs, receivedAt, now]);

  /**
   * Статус соединения определяется реальными данными Gateway:
   * успешный ответ / WS-фрейм + поле online + dataAgeMs.
   * Само по себе открытое WebSocket-соединение статус В СЕТИ не даёт.
   */
  const conn = useMemo<ConnectionStatus>(() => {
    if (rebooting && rawConn !== "ONLINE") return "RECONNECTING";
    if (rawConn !== "ONLINE") return rawConn;
    if (toBool(data?.online) === false) return "OFFLINE";
    if (dataAge !== null && dataAge > STALE_MS) return "STALE";
    return "ONLINE";
  }, [rebooting, rawConn, data?.online, dataAge]);

  /** Статус BMS: bmsOnline + bmsDataAgeMs против единого порога STALE_MS. */
  const bmsState = useMemo<SubsystemState>(() => {
    if (conn === "OFFLINE") return "OFFLINE";
    const b = toBool(data?.bmsOnline) ?? toBool(bms?.online);
    if (b === null) return "NO_DATA";
    if (!b) return "OFFLINE";
    const bmsAge =
      num(data?.bmsDataAgeMs) ?? num(status?.bms_data_age_ms) ?? num(bms?.data_age_ms);
    if (bmsAge !== null && bmsAge > STALE_MS) return "STALE";
    return "ONLINE";
  }, [conn, data?.bmsOnline, data?.bmsDataAgeMs, bms?.online, bms?.data_age_ms, status?.bms_data_age_ms]);

  /**
   * Статус Modbus-контроллера.
   * Наличие СТАРЫХ числовых полей не считается доказательством работы:
   * при устаревших данных показывается ДАННЫЕ УСТАРЕЛИ, при потере связи — НЕТ СВЯЗИ.
   */
  const controllerState = useMemo<SubsystemState>(() => {
    if (conn === "OFFLINE") return "OFFLINE";
    if (conn === "STALE") return "STALE";
    if (conn !== "ONLINE") return "NO_DATA";
    const hasFreshModbus = [
      data?.pvVoltage,
      data?.pvCurrent,
      data?.pvPower,
      data?.chargePower,
      data?.loadVoltage,
      data?.loadCurrent,
      data?.loadPower,
    ].some((v) => num(v) !== null);
    return hasFreshModbus ? "ONLINE" : "NO_DATA";
  }, [conn, data]);

  /** Счётчики интерфейса (браузер/frontend), не счётчики ESP32. */
  const counters = useMemo<SessionCounters>(
    () => ({ requests: httpStats.requests, errors: httpStats.errors }),
    // перечитываются на каждом тике провайдера (1 с)
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
    if (!isRecord(res)) throw new Error("Некорректный ответ /api/engineering");
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
    if (!isRecord(res)) throw new Error("Некорректный ответ /api/raw");
    return res as RawData;
  }, []);

  const fetchWifi = useCallback(async () => {
    const res = await api.get<unknown>("/api/wifi");
    if (!isRecord(res)) throw new Error("Некорректный ответ /api/wifi");
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
      receivedAt,
      measureTs,
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
      receivedAt,
      measureTs,
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
  if (!ctx) throw new Error("useData должен использоваться внутри DataProvider");
  return ctx;
}
