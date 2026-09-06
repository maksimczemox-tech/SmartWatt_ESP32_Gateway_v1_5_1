/**
 * Централизованный Data Store приложения.
 *
 * Цепочка данных:
 *   ESP32 → HTTP API / WebSocket → Validation (services/validation.ts)
 *         → Normalized Store (этот модуль) → Расчетные показатели → React UI
 *
 * UI-компоненты не обращаются к API и не обрабатывают сырые ответы.
 *
 * ИСТОРИЯ: прошивка v1.6.x не имеет /api/history. Store ведёт локальный
 * ring buffer (до 3600) из РЕАЛЬНО полученных фреймов WebSocket и ответов
 * /api/data. Точки не создаются, не интерполируются и не дублируются.
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
  type LogEntry,
  type RawData,
  type SamplePoint,
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
  normalizeLogs,
  validateBmsData,
  validateRawData,
  validateStatusData,
  validateSystemData,
  validateVersionData,
  validateWifiData,
} from "../services/validation";
import { num, toBool } from "../utils/format";
import { estimatedLoadPower } from "../utils/energy";
import { useNow } from "../hooks/useNow";

/**
 * Единая конфигурационная константа актуальности данных.
 * Данные старше этого возраста считаются устаревшими (ДАННЫЕ УСТАРЕЛИ).
 * Используется для Gateway, телеметрии, BMS и Modbus — порог не дублируется.
 */
export const STALE_MS = 30_000;

const DATA_POLL_MS = 5_000;
const BMS_POLL_MS = 8_000;
const STATUS_POLL_MS = 10_000;
const MAX_SAMPLES = 3_600;
/**
 * Максимальный возраст данных /api/bms (мс), при котором их ещё можно
 * отнести к текущему телеметрическому фрейму. Если data_age_ms неизвестен
 * или больше порога — BMS не синхронизируется с исторической точкой.
 */
const BMS_SYNC_MAX_AGE_MS = 10_000;

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

function normTs(v: unknown): number | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
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

  /** Состояния подсистем (раздельно, по реальным полям). */
  telemetryState: SubsystemState;
  bmsState: SubsystemState;
  controllerState: SubsystemState;

  /**
   * Показания АКБ с логичным приоритетом источников (только реальные значения):
   *   SOC:        data.batterySOC → data.bmsSOC → /api/bms soc
   *   Мощность:   data.bmsPower → /api/bms power
   *   Напряжение: data.batteryVoltage → data.bmsVoltage → /api/bms voltage
   *   Ёмкости:    data.bms*Ah → /api/bms
   * Если ни одного реального источника нет — null («Нет данных»).
   */
  bat: BatteryDerived;

  /** Реально полученные samples (ring buffer). Момент запуска интерфейса. */
  samples: SamplePoint[];
  sessionStart: number;

  fetchEngineering: () => Promise<EngineeringData>;
  fetchConfig: () => Promise<Record<string, unknown>>;
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

export interface BatteryDerived {
  soc: number | null;
  voltage: number | null;
  current: number | null;
  power: number | null;
  remainingAh: number | null;
  fullAh: number | null;
  temp: number | null;
  cycles: number | null;
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
  const [samples, setSamples] = useState<SamplePoint[]>([]);
  const [sessionStart] = useState<number>(() => Date.now());

  const failsRef = useRef(0);
  const everOnlineRef = useRef(false);
  const versionDoneRef = useRef(false);
  /** Актуальный снапшот /api/bms для безопасной синхронизации samples. */
  const bmsRef = useRef<BmsData | null>(null);
  bmsRef.current = bms;

  const now = useNow(1000);

  /* ---------------- применение телеметрии (HTTP и WS) ---------------- */

  const applyTelemetry = useCallback((frame: SystemData) => {
    const received = Date.now();
    setData((prev) => mergeTelemetry(prev, frame));
    setReceivedAt(received);

    /* ring buffer: сохраняем только реально полученный фрейм */
    const ts = normTs(frame.timestamp) ?? received;
    const pv = frame.pvPower ?? null;
    let batt = frame.bmsPower ?? null;
    let soc = frame.batterySOC ?? frame.bmsSOC ?? null;

    /*
     * Безопасная синхронизация BMS с исторической точкой.
     * 1) BMS из фрейма телеметрии — если реально присутствует.
     * 2) Если отсутствует — данные /api/bms берутся ТОЛЬКО при доказанной
     *    свежести их измерения (data_age_ms ≤ порога синхронизации).
     * 3) Если время измерения BMS неизвестно (data_age_ms нет) —
     *    значения не приклеиваются к точке (null), чтобы не смешивать
     *    данные разных моментов. Искусственные timestamp не создаются.
     */
    if (batt === null || soc === null) {
      const b = bmsRef.current;
      const bAge = num(b?.data_age_ms);
      if (b !== null && bAge !== null && bAge <= BMS_SYNC_MAX_AGE_MS) {
        if (batt === null) batt = num(b.power);
        if (soc === null) soc = num(b.soc);
      }
    }

    const load = estimatedLoadPower(pv, batt);
    const valid = toBool(frame.online) !== false;
    setSamples((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].ts >= ts) return prev;
      const next = [...prev, { ts, pv, batt, load, soc, valid }];
      return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
    });

    failsRef.current = 0;
    everOnlineRef.current = true;
    setRebooting(false);
    setRawConn("ONLINE");

    if (!versionDoneRef.current) {
      versionDoneRef.current = true;
      api
        .get<unknown>("/api/version")
        .then((v) => setVersion(validateVersionData(v)))
        .catch(() => setVersion(null));
    }
  }, []);

  const applyHttpFailure = useCallback(() => {
    failsRef.current += 1;
    if (!everOnlineRef.current) {
      setRawConn(failsRef.current >= 3 ? "OFFLINE" : "CONNECTING");
      return;
    }
    setRawConn(failsRef.current >= 3 ? "OFFLINE" : "RECONNECTING");
  }, []);

  /* ---------------- polling (HTTP: первичные данные и fallback) ---------------- */

  const pollData = useCallback(async () => {
    try {
      const res = await api.get<unknown>("/api/data");
      const frame = validateSystemData(res);
      if (frame === null) throw new Error("Некорректные данные /api/data");
      applyTelemetry(frame);
    } catch {
      applyHttpFailure();
    }
  }, [applyTelemetry, applyHttpFailure]);

  const pollBms = useCallback(async () => {
    try {
      const res = await api.get<unknown>("/api/bms");
      setBms(validateBmsData(res));
    } catch {
      /* предыдущее значение сохраняется; статус — через pollData */
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await api.get<unknown>("/api/status");
      setStatus(validateStatusData(res));
    } catch {
      /* noop */
    }
  }, []);

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
      if (frame !== null) applyTelemetry(frame);
    };
    sock.connect();
    return () => sock.close();
  }, [applyTelemetry]);

  /* ---------------- производные значения ---------------- */

  const measureTs = useMemo(() => normTs(data?.timestamp), [data?.timestamp]);

  const dataAge = useMemo<number | null>(() => {
    const reported = num(data?.dataAgeMs);
    if (reported !== null) return reported;
    if (receivedAt !== null) return Math.max(0, now - receivedAt);
    return null;
  }, [data?.dataAgeMs, receivedAt, now]);

  const conn = useMemo<ConnectionStatus>(() => {
    if (rebooting && rawConn !== "ONLINE") return "RECONNECTING";
    if (rawConn === "ONLINE") return dataAge !== null && dataAge > STALE_MS ? "STALE" : "ONLINE";
    return rawConn;
  }, [rawConn, rebooting, dataAge]);

  /* Состояние телеметрии: по свежести данных, а не по факту соединения. */
  const telemetryState = useMemo<SubsystemState>(() => {
    if (data === null) return rawConn === "OFFLINE" ? "OFFLINE" : "NO_DATA";
    if (rawConn === "OFFLINE") return "OFFLINE";
    if (dataAge !== null && dataAge > STALE_MS) return "STALE";
    return "ONLINE";
  }, [data, rawConn, dataAge]);

  /* BMS: bmsOnline + bmsDataAgeMs. */
  const bmsState = useMemo<SubsystemState>(() => {
    const online = toBool(data?.bmsOnline) ?? toBool(bms?.online) ?? toBool(status?.bms_online);
    if (online === null) return rawConn === "OFFLINE" ? "OFFLINE" : "NO_DATA";
    if (!online) return "OFFLINE";
    const bmsAge = num(data?.bmsDataAgeMs) ?? num(status?.bms_data_age_ms) ?? num(bms?.data_age_ms);
    if (bmsAge !== null && bmsAge > STALE_MS) return "STALE";
    if (rawConn === "OFFLINE") return "OFFLINE";
    return "ONLINE";
  }, [data?.bmsOnline, bms?.online, bms?.data_age_ms, status?.bms_online, status?.bms_data_age_ms, data?.bmsDataAgeMs, rawConn]);

  /*
   * Modbus-контроллер: только controller_online / data age из Gateway.
   * Наличие числовых полей НЕ считается доказательством работоспособности.
   */
  const controllerState = useMemo<SubsystemState>(() => {
    const online = toBool(status?.controller_online);
    if (online === null) return rawConn === "OFFLINE" ? "OFFLINE" : "NO_DATA";
    if (!online) return "OFFLINE";
    const modbusAge = num(status?.modbus_data_age_ms) ?? dataAge;
    if (modbusAge !== null && modbusAge > STALE_MS) return "STALE";
    if (rawConn === "OFFLINE") return "OFFLINE";
    return "ONLINE";
  }, [status?.controller_online, status?.modbus_data_age_ms, dataAge, rawConn]);

  const counters = useMemo<SessionCounters>(
    () => ({ requests: httpStats.requests, errors: httpStats.errors }),
    // счётчики перечитываются на каждом тике провайдера (1 c)
    [now],
  );

  /* Показания АКБ: приоритет телеметрии /api/data, затем реальные данные /api/bms. */
  const bat = useMemo<BatteryDerived>(
    () => ({
      soc: num(data?.batterySOC) ?? num(data?.bmsSOC) ?? num(bms?.soc),
      voltage: num(data?.batteryVoltage) ?? num(data?.bmsVoltage) ?? num(bms?.voltage),
      current: num(data?.batteryCurrent) ?? num(data?.bmsCurrent) ?? num(bms?.current),
      power: num(data?.bmsPower) ?? num(bms?.power),
      remainingAh: num(data?.bmsRemainingAh) ?? num(bms?.remaining_ah),
      fullAh: num(data?.bmsFullCapacityAh) ?? num(bms?.full_capacity_ah),
      temp: num(data?.batteryTemp),
      cycles: num(data?.bmsCycles) ?? num(bms?.cycles),
    }),
    [data, bms],
  );

  /* ---------------- действия (единственный путь UI → Gateway) ---------------- */

  const fetchEngineering = useCallback(async () => {
    const res = await api.get<unknown>("/api/engineering");
    if (!isRecord(res)) throw new Error("Некорректные данные /api/engineering");
    return res as EngineeringData;
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await api.get<unknown>("/api/config");
    if (!isRecord(res)) throw new Error("Некорректные данные /api/config");
    return res;
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
    const validated = validateRawData(res);
    if (validated === null) throw new Error("Некорректные данные /api/raw");
    return validated;
  }, []);

  const fetchWifi = useCallback(async () => {
    const res = await api.get<unknown>("/api/wifi");
    const validated = validateWifiData(res);
    if (validated === null) throw new Error("Некорректные данные /api/wifi");
    return validated;
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
      telemetryState,
      bmsState,
      controllerState,
      bat,
      samples,
      sessionStart,
      fetchEngineering,
      fetchConfig,
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
      telemetryState,
      bmsState,
      controllerState,
      bat,
      samples,
      sessionStart,
      fetchEngineering,
      fetchConfig,
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
