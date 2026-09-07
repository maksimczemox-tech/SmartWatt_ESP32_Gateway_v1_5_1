/**
 * Строгие типы ответов SmartWatt ESP32 Gateway v1.6.x.
 * Все телеметрические поля опциональны и nullable:
 * отсутствующее значение отображается как "—", никогда не подменяется числом.
 *
 * ВАЖНО: в прошивке v1.6.x отсутствует endpoint /api/history —
 * фронтенд его не запрашивает. История формируется только из реально
 * полученных WebSocket/API samples (локальный ring buffer).
 */

export type ConnectionStatus =
  | "CONNECTING"
  | "ONLINE"
  | "OFFLINE"
  | "RECONNECTING"
  | "STALE";

export type SubsystemState = "ONLINE" | "OFFLINE" | "STALE" | "NO_DATA";

/* ---------------- GET /api/data ---------------- */

export interface SystemData {
  online?: boolean | null;
  wifi?: boolean | null;
  ip?: string | null;
  timestamp?: number | null;
  dataAgeMs?: number | null;

  batterySOC?: number | null;
  batteryVoltage?: number | null;
  batteryCurrent?: number | null;
  batteryTemp?: number | null;
  batteryMinVoltage?: number | null;
  batteryMaxVoltage?: number | null;

  pvVoltage?: number | null;
  pvCurrent?: number | null;
  pvPower?: number | null;
  chargePower?: number | null;

  maxChargeCurrent?: number | null;
  maxChargePower?: number | null;

  loadVoltage?: number | null;
  loadCurrent?: number | null;
  loadPower?: number | null;
  loadState?: boolean | null;
  maxLoadCurrent?: number | null;
  maxLoadPower?: number | null;

  controllerTemp?: number | null;
  chargeState?: number | string | null;

  fault?: boolean | null;
  faultCode?: number | null;
  faultDescription?: string | null;

  dailyChargeAh?: number | null;
  dailyLoadAh?: number | null;

  totalChargeAh?: number | null;
  totalLoadAh?: number | null;

  totalChargeWh?: number | null;
  totalLoadWh?: number | null;

  runningDays?: number | null;
  fullCharges?: number | null;
  overDischarges?: number | null;

  bmsOnline?: boolean | null;
  bmsDataAgeMs?: number | null;
  bmsVoltage?: number | null;
  bmsCurrent?: number | null;
  bmsPower?: number | null;
  bmsRemainingAh?: number | null;
  bmsFullCapacityAh?: number | null;
  bmsCycles?: number | null;
  bmsSOC?: number | null;
  bmsCellCount?: number | null;
  bmsNtcCount?: number | null;

  bmsMinCellVoltage?: number | null;
  bmsMaxCellVoltage?: number | null;
  bmsDeltaCellVoltage?: number | null;
  bmsAverageCellVoltage?: number | null;

  bmsProtection?: number | null;
  bmsProtectionText?: string | null;

  bmsFetStatus?: number | null;
  bmsChargeFet?: boolean | null;
  bmsDischargeFet?: boolean | null;
  bmsBalancing?: boolean | null;
  bmsOperation?: number | string | null;

  bmsCells?: (number | null)[] | null;
  bmsTemperatures?: (number | null)[] | null;
}

/* ---------------- GET /api/bms ---------------- */

export interface JbdDiagnostics {
  requests?: number | null;
  successful?: number | null;
  errors?: number | null;
  timeouts?: number | null;
  crc_errors?: number | null;
  protocol_errors?: number | null;
  basic_ok?: boolean | null;
  cells_ok?: boolean | null;
  last_error?: string | number | null;
  last_crc_ok?: boolean | null;
  last_response_length?: number | null;
  last_request_hex?: string | null;
  last_response_hex?: string | null;
}

export interface BmsData {
  online?: boolean | null;
  data_age_ms?: number | null;

  voltage?: number | null;
  current?: number | null;
  power?: number | null;

  remaining_ah?: number | null;
  full_capacity_ah?: number | null;

  soc?: number | null;
  cycles?: number | null;

  cell_count?: number | null;
  ntc_count?: number | null;

  min_cell_v?: number | null;
  max_cell_v?: number | null;
  delta_cell_v?: number | null;

  cells?: (number | null)[] | null;
  temperatures?: (number | null)[] | null;

  protection?: number | null;
  protection_text?: string | null;

  operation?: number | string | null;

  charge_fet?: boolean | null;
  discharge_fet?: boolean | null;
  balancing?: boolean | null;

  diagnostics?: JbdDiagnostics | null;
}

/* ---------------- GET /api/status ---------------- */

export interface StatusData {
  device?: string | null;
  online?: boolean | null;
  wifi?: boolean | null;
  connected_ssid?: string | null;
  rssi?: number | null;
  sta_ip?: string | null;

  ap_enabled?: boolean | null;
  ap_ip?: string | null;

  /** Реальное состояние Modbus-контроллера из прошивки (если предоставляется). */
  controller_online?: boolean | null;
  modbus_data_age_ms?: number | null;
  modbus_errors?: number | null;
  modbus_retries?: number | null;
  last_modbus_error?: string | number | null;

  bms_online?: boolean | null;
  bms_data_age_ms?: number | null;

  bms_requests?: number | null;
  bms_errors?: number | null;

  uptime_ms?: number | null;
  data_age_ms?: number | null;

  firmware_version?: string | null;

  free_heap?: number | null;
  min_free_heap?: number | null;
}

/* ---------------- GET /api/version /api/health ---------------- */

export interface VersionData {
  firmware_version?: string | null;
  version?: string | null;
  fw_version?: string | null;
  device?: string | null;
  build?: string | null;
}

export interface HealthData {
  ok?: boolean | null;
  status?: string | null;
  uptime_ms?: number | null;
  free_heap?: number | null;
  version?: string | null;
}

/* ---------------- GET /api/wifi ---------------- */

export interface WifiData {
  ssid?: string | null;
  password_saved?: boolean | null;
  passwordSaved?: boolean | null;
  connected?: boolean | null;
  connected_ssid?: string | null;
  connectedSsid?: string | null;
  sta_ip?: string | null;
  staIp?: string | null;
  ip?: string | null;
  rssi?: number | null;

  ap_enabled?: boolean | null;
  apEnabled?: boolean | null;
  ap_ssid?: string | null;
  apSsid?: string | null;
  ap_ip?: string | null;
  apIp?: string | null;
  ap_clients?: number | null;
  apClients?: number | null;
  ap_channel?: number | null;
  apChannel?: number | null;
  ap_max_clients?: number | null;
  apMaxClients?: number | null;
  ap_dhcp?: string | boolean | number | null;
  apDhcp?: string | boolean | number | null;
}

/* ---------------- GET /api/raw ---------------- */

export interface RawData {
  slave_id?: number | null;
  function?: number | string | null;
  start_register?: number | null;
  register_count?: number | null;
  registers?: unknown;
  last_response_crc_ok?: boolean | null;
  last_response_length?: number | null;
  last_modbus_error?: string | number | null;
  request_hex?: string | null;
  response_hex?: string | null;
}

/* ---------------- GET /api/logs ---------------- */

export interface LogEntry {
  text: string;
  ts?: number | null;
  level?: string | null;
}

/* ---------------- GET /api/engineering /api/config ---------------- */

export type EngineeringData = Record<string, unknown>;

/* ---------------- локальный ring buffer samples (WebSocket / опрос) ---------------- */

/**
 * Одна точка истории, полученная от Gateway (WebSocket-фрейм или ответ /api/data).
 * Фронтенд точки НЕ создаёт: только сохраняет реально полученные фреймы.
 *   pv   — мощность PV (измерено)
 *   batt — мощность BMS: >0 заряд, <0 разряд (измерено)
 *   load — расчетная нагрузка max(0, pv − batt) (расчет)
 *   soc  — заряд батареи (измерено)
 *   valid — признак достоверности фрейма
 */
export interface SamplePoint {
  ts: number;
  pv: number | null;
  batt: number | null;
  load: number | null;
  soc: number | null;
  valid: boolean;
}

/* ---------------- GET/POST /api/config ---------------- */

export interface ConfigData {
  /** Широта, −90…+90. null = не задана (значение по умолчанию не предполагается). */
  latitude?: number | null;
  /** Долгота, −180…+180. null = не задана. */
  longitude?: number | null;
  /** Источник погоды: "none" | "open-meteo". Хранится в NVS Gateway. */
  weather_provider?: string | null;
  /** Остальные поля конфигурации прошивки (baudrate, slave_id и т.д.). */
  [key: string]: unknown;
}

/** Патч для POST /api/config: обновляются только переданные поля. */
export interface EspConfigPatch {
  latitude?: number | null;
  longitude?: number | null;
  weather_provider?: string | null;
}

/* ---------------- store ---------------- */

export interface SessionCounters {
  requests: number;
  errors: number;
}
