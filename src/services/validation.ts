/**
 * ЕДИНЫЙ СЛОЙ ВАЛИДАЦИИ ДАННЫХ.
 *
 * Архитектура:
 *   ESP32 → API / WebSocket → Validation (этот модуль) → Normalized Store → UI
 *
 * Компоненты не обрабатывают сырые ответы самостоятельно.
 * Правила:
 *  - null / undefined / NaN / Infinity / неверный тип → null ("—" в UI);
 *  - недопустимое значение никогда не превращается в 0;
 *  - неизвестные поля отбрасываются, известные — нормализуются.
 *
 * ВАЖНО: прошивка v1.6.x не имеет /api/history — валидатор истории отсутствует,
 * история собирается из реальных samples (WebSocket / опрос /api/data).
 */

import type {
  BmsData,
  JbdDiagnostics,
  LogEntry,
  RawData,
  StatusData,
  SystemData,
  VersionData,
  WifiData,
} from "../types";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/* ---------------- примитивы ---------------- */

/** Конечное число (number или числовая строка). Всё остальное → null. */
export function sanitizeNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function sanitizeBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const n = sanitizeNumber(v);
  if (n !== null) return n !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["on", "true", "yes", "enabled"].includes(s)) return true;
    if (["off", "false", "no", "disabled"].includes(s)) return false;
  }
  return null;
}

export function sanitizeString(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? null : s;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Значение, допустимое как число или строка (charge_state, operation…). */
export function sanitizeFlex(v: unknown): number | string | null {
  if (typeof v === "string") return sanitizeString(v);
  return sanitizeNumber(v);
}

function sanitizeNumberArray(v: unknown): (number | null)[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((x) => sanitizeNumber(x));
}

/* ---------------- /api/data и WS-фреймы ---------------- */

const SYS_NUM = [
  "timestamp",
  "dataAgeMs",
  "batterySOC",
  "batteryVoltage",
  "batteryCurrent",
  "batteryTemp",
  "batteryMinVoltage",
  "batteryMaxVoltage",
  "pvVoltage",
  "pvCurrent",
  "pvPower",
  "chargePower",
  "maxChargeCurrent",
  "maxChargePower",
  "loadVoltage",
  "loadCurrent",
  "loadPower",
  "maxLoadCurrent",
  "maxLoadPower",
  "controllerTemp",
  "faultCode",
  "dailyChargeAh",
  "dailyLoadAh",
  "dailyChargeWh",
  "dailyLoadWh",
  "totalChargeAh",
  "totalLoadAh",
  "totalChargeWh",
  "totalLoadWh",
  "runningDays",
  "fullCharges",
  "overDischarges",
  "bmsDataAgeMs",
  "bmsVoltage",
  "bmsCurrent",
  "bmsPower",
  "bmsRemainingAh",
  "bmsFullCapacityAh",
  "bmsCycles",
  "bmsSOC",
  "bmsCellCount",
  "bmsNtcCount",
  "bmsMinCellVoltage",
  "bmsMaxCellVoltage",
  "bmsDeltaCellVoltage",
  "bmsAverageCellVoltage",
  "bmsProtection",
  "bmsFetStatus",
] as const;

const SYS_BOOL = [
  "online",
  "wifi",
  "loadState",
  "fault",
  "bmsOnline",
  "bmsChargeFet",
  "bmsDischargeFet",
  "bmsBalancing",
] as const;

const SYS_STR = ["ip", "faultDescription", "bmsProtectionText"] as const;
const SYS_FLEX = ["chargeState", "bmsOperation"] as const;

/** Ключи, по которым объект распознаётся как телеметрический фрейм. */
const TELEMETRY_KEYS: readonly string[] = [
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

export function validateSystemData(raw: unknown): SystemData | null {
  if (!isRecord(raw)) return null;
  const out: SystemData = {};
  for (const k of SYS_NUM) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeNumber(raw[k]);
  for (const k of SYS_BOOL) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeBool(raw[k]);
  for (const k of SYS_STR) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeString(raw[k]);
  for (const k of SYS_FLEX) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeFlex(raw[k]);
  if ("bmsCells" in raw) out.bmsCells = sanitizeNumberArray(raw.bmsCells);
  if ("bmsTemperatures" in raw) out.bmsTemperatures = sanitizeNumberArray(raw.bmsTemperatures);
  return out;
}

/** Извлечь телеметрический фрейм из произвольного WS-сообщения. */
export function extractTelemetry(payload: unknown): SystemData | null {
  if (!isRecord(payload)) return null;
  const inner = payload.data;
  const candidate = isRecord(inner) ? inner : payload;
  if (!TELEMETRY_KEYS.some((k) => k in candidate)) return null;
  return validateSystemData(candidate);
}

/* ---------------- /api/bms ---------------- */

const BMS_NUM = [
  "data_age_ms",
  "voltage",
  "current",
  "power",
  "remaining_ah",
  "full_capacity_ah",
  "soc",
  "cycles",
  "cell_count",
  "ntc_count",
  "min_cell_v",
  "max_cell_v",
  "delta_cell_v",
  "protection",
] as const;

const BMS_BOOL = ["online", "charge_fet", "discharge_fet", "balancing"] as const;
const BMS_STR = ["protection_text"] as const;

const DIAG_NUM = [
  "requests",
  "successful",
  "errors",
  "timeouts",
  "crc_errors",
  "protocol_errors",
  "last_response_length",
] as const;
const DIAG_BOOL = ["basic_ok", "cells_ok", "last_crc_ok"] as const;
const DIAG_STR = ["last_request_hex", "last_response_hex"] as const;

export function validateJbdDiagnostics(raw: unknown): JbdDiagnostics | null {
  if (!isRecord(raw)) return null;
  const out: JbdDiagnostics = {};
  for (const k of DIAG_NUM) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeNumber(raw[k]);
  for (const k of DIAG_BOOL) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeBool(raw[k]);
  for (const k of DIAG_STR) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeString(raw[k]);
  if ("last_error" in raw) out.last_error = sanitizeFlex(raw.last_error);
  return out;
}

export function validateBmsData(raw: unknown): BmsData | null {
  if (!isRecord(raw)) return null;
  const out: BmsData = {};
  for (const k of BMS_NUM) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeNumber(raw[k]);
  for (const k of BMS_BOOL) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeBool(raw[k]);
  for (const k of BMS_STR) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeString(raw[k]);
  if ("operation" in raw) out.operation = sanitizeFlex(raw.operation);
  if ("cells" in raw) out.cells = sanitizeNumberArray(raw.cells);
  if ("temperatures" in raw) out.temperatures = sanitizeNumberArray(raw.temperatures);
  if ("diagnostics" in raw) out.diagnostics = validateJbdDiagnostics(raw.diagnostics);
  return out;
}

/* ---------------- /api/status ---------------- */

const STATUS_NUM = [
  "rssi",
  "modbus_data_age_ms",
  "modbus_errors",
  "modbus_retries",
  "bms_data_age_ms",
  "bms_requests",
  "bms_errors",
  "uptime_ms",
  "data_age_ms",
  "free_heap",
  "min_free_heap",
] as const;

const STATUS_BOOL = ["online", "wifi", "ap_enabled", "bms_online", "controller_online"] as const;
const STATUS_STR = ["device", "connected_ssid", "sta_ip", "ap_ip", "firmware_version"] as const;

export function validateStatusData(raw: unknown): StatusData | null {
  if (!isRecord(raw)) return null;
  const out: StatusData = {};
  for (const k of STATUS_NUM) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeNumber(raw[k]);
  for (const k of STATUS_BOOL) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeBool(raw[k]);
  for (const k of STATUS_STR) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeString(raw[k]);
  if ("last_modbus_error" in raw) out.last_modbus_error = sanitizeFlex(raw.last_modbus_error);
  return out;
}

/* ---------------- /api/version ---------------- */

const VERSION_STR = ["firmware_version", "version", "fw_version", "device", "build"] as const;

export function validateVersionData(raw: unknown): VersionData | null {
  if (!isRecord(raw)) return null;
  const out: VersionData = {};
  for (const k of VERSION_STR) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeString(raw[k]);
  return out;
}

/* ---------------- /api/wifi ---------------- */

const WIFI_NUM = ["rssi", "ap_clients", "ap_channel", "ap_max_clients"] as const;
const WIFI_STR = [
  "ssid",
  "connected_ssid",
  "connectedSsid",
  "sta_ip",
  "staIp",
  "ip",
  "ap_ssid",
  "apSsid",
  "ap_ip",
  "apIp",
] as const;
const WIFI_BOOL = [
  "password_saved",
  "passwordSaved",
  "connected",
  "ap_enabled",
  "apEnabled",
] as const;

export function validateWifiData(raw: unknown): WifiData | null {
  if (!isRecord(raw)) return null;
  const out: WifiData = {};
  for (const k of WIFI_NUM) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeNumber(raw[k]);
  for (const k of WIFI_STR) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeString(raw[k]);
  for (const k of WIFI_BOOL) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeBool(raw[k]);
  if ("ap_dhcp" in raw) out.ap_dhcp = sanitizeFlex(raw.ap_dhcp);
  if ("apDhcp" in raw) out.apDhcp = sanitizeFlex(raw.apDhcp);
  if ("ap_clients" in raw) out.ap_clients = sanitizeNumber(raw.ap_clients);
  if ("apClients" in raw) out.apClients = sanitizeNumber(raw.apClients);
  return out;
}

/* ---------------- /api/raw ---------------- */

const RAW_NUM = ["slave_id", "start_register", "register_count", "last_response_length"] as const;
const RAW_STR = ["request_hex", "response_hex"] as const;

export function validateRawData(raw: unknown): RawData | null {
  if (!isRecord(raw)) return null;
  const out: RawData = {};
  for (const k of RAW_NUM) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeNumber(raw[k]);
  for (const k of RAW_STR) if (k in raw) (out as Record<string, unknown>)[k] = sanitizeString(raw[k]);
  if ("function" in raw) out.function = sanitizeFlex(raw.function);
  if ("last_response_crc_ok" in raw) out.last_response_crc_ok = sanitizeBool(raw.last_response_crc_ok);
  if ("last_modbus_error" in raw) out.last_modbus_error = sanitizeFlex(raw.last_modbus_error);
  if ("registers" in raw) out.registers = raw.registers;
  return out;
}

/* ---------------- /api/logs ---------------- */

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
    if (!isRecord(item)) continue;
    const rawText = item.msg ?? item.message ?? item.text ?? item.line ?? item.log;
    const text = sanitizeString(rawText);
    if (text === null) continue;
    const tsNum = sanitizeNumber(item.ts ?? item.time ?? item.timestamp);
    out.push({
      text,
      ts: tsNum === null ? null : tsNum < 1e12 ? tsNum * 1000 : tsNum,
      level: sanitizeString(item.level ?? item.lvl),
    });
  }
  return out;
}
