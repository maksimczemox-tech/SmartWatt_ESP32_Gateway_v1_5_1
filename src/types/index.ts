/**
 * Строгие типы ответов SmartWatt ESP32 Gateway v1.6.0.
 * Все телеметрические поля опциональны и nullable:
 * отсутствующее значение отображается как "—", никогда не подменяется числом.
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
  online?: boolean | number | null;
  wifi?: boolean | number | null;
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
  loadState?: boolean | number | string | null;
  maxLoadCurrent?: number | null;
  maxLoadPower?: number | null;

  controllerTemp?: number | null;
  chargeState?: number | string | null;

  fault?: boolean | number | null;
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

  bmsOnline?: boolean | number | null;
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
  bmsChargeFet?: boolean | number | null;
  bmsDischargeFet?: boolean | number | null;
  bmsBalancing?: boolean | number | null;
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
  basic_ok?: boolean | number | null;
  cells_ok?: boolean | number | null;
  last_error?: string | number | null;
  last_crc_ok?: boolean | number | null;
  last_response_length?: number | null;
  last_request_hex?: string | null;
  last_response_hex?: string | null;
}

export interface BmsData {
  online?: boolean | number | null;
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

  charge_fet?: boolean | number | null;
  discharge_fet?: boolean | number | null;
  balancing?: boolean | number | null;

  diagnostics?: JbdDiagnostics | null;
}

/* ---------------- GET /api/status ---------------- */

export interface StatusData {
  device?: string | null;
  online?: boolean | number | null;
  wifi?: boolean | number | null;
  connected_ssid?: string | null;
  rssi?: number | null;
  sta_ip?: string | null;

  ap_enabled?: boolean | number | null;
  ap_ip?: string | null;

  modbus_errors?: number | null;
  modbus_retries?: number | null;
  last_modbus_error?: string | number | null;

  bms_online?: boolean | number | null;
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
  [key: string]: unknown;
}

export interface HealthData {
  ok?: boolean | number | null;
  status?: string | null;
  uptime_ms?: number | null;
  free_heap?: number | null;
  version?: string | null;
  [key: string]: unknown;
}

/* ---------------- GET /api/history ---------------- */

export interface HistoryPoint {
  ts: number;
  pv?: number | null;
  batt?: number | null;
  load?: number | null;
  soc?: number | null;
  valid?: boolean | number | null;
}

export type HistoryRange = "default" | "7d";

/* ---------------- GET /api/wifi ---------------- */

export interface WifiData {
  ssid?: string | null;
  password_saved?: boolean | number | null;
  passwordSaved?: boolean | number | null;
  connected?: boolean | number | null;
  connected_ssid?: string | null;
  connectedSsid?: string | null;
  sta_ip?: string | null;
  staIp?: string | null;
  ip?: string | null;
  rssi?: number | null;

  ap_enabled?: boolean | number | null;
  apEnabled?: boolean | number | null;
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
  ap_dhcp?: boolean | number | string | null;
  apDhcp?: boolean | number | string | null;

  [key: string]: unknown;
}

/* ---------------- GET /api/raw ---------------- */

export interface RawData {
  slave_id?: number | null;
  function?: number | string | null;
  start_register?: number | null;
  register_count?: number | null;
  registers?: unknown;
  last_response_crc_ok?: boolean | number | null;
  last_response_length?: number | null;
  last_modbus_error?: string | number | null;
  request_hex?: string | null;
  response_hex?: string | null;
  [key: string]: unknown;
}

/* ---------------- GET /api/logs ---------------- */

export interface LogEntry {
  text: string;
  ts?: number | null;
  level?: string | null;
}

/* ---------------- GET /api/engineering ---------------- */

export type EngineeringData = Record<string, unknown>;

/* ---------------- store ---------------- */

export interface SessionCounters {
  requests: number;
  errors: number;
}
