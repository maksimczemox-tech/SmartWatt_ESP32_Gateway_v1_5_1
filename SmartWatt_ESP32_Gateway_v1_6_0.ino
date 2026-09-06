#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <math.h>
#include <stdarg.h>
#include <Preferences.h>

#include "config.h"
#include "jbd_bms.h"
#include "index_html.h"

HardwareSerial ModbusSerial(2);
HardwareSerial JbdSerial(1);
JbdBms jbdBms(JbdSerial, JBD_RX_PIN, JBD_TX_PIN, JBD_BAUDRATE, JBD_TIMEOUT_MS);
WebServer server(HTTP_PORT);
WebSocketsServer webSocket(WEBSOCKET_PORT);
SemaphoreHandle_t dataMutex = nullptr;
SemaphoreHandle_t jbdMutex = nullptr;
SemaphoreHandle_t logMutex = nullptr;

static constexpr uint16_t LOG_LINE_COUNT = 80;
static constexpr uint16_t LOG_LINE_LENGTH = 180;
char logLines[LOG_LINE_COUNT][LOG_LINE_LENGTH] = {{0}};
uint16_t logWriteIndex = 0;
uint16_t logStoredCount = 0;

struct SmartWattData {
  bool online = false;
  uint32_t timestamp = 0;

  float batteryVoltage = NAN;
  float batteryCurrent = NAN;
  float batterySoc = NAN;
  float batteryTemperature = NAN;
  float batteryMinVoltage = NAN;
  float batteryMaxVoltage = NAN;

  float pvVoltage = NAN;
  float pvCurrent = NAN;
  float pvPower = NAN;
  float chargePower = NAN;
  float maxChargeCurrent = NAN;
  float maxChargePower = NAN;

  float loadVoltage = NAN;
  float loadCurrent = NAN;
  float loadPower = NAN;
  bool loadEnabled = false;
  bool loadEnabledValid = false;
  float maxLoadCurrent = NAN;
  float maxLoadPower = NAN;

  float controllerTemperature = NAN;
  String chargeState = "UNKNOWN";

  uint16_t rawFaultRegister = 0;
  uint16_t rawChargeStatus = 0;

  float dailyChargeAh = NAN;
  float dailyLoadAh = NAN;
  float totalChargeAh = NAN;
  float totalLoadAh = NAN;
  float totalChargeWh = NAN;
  float totalLoadWh = NAN;

  uint32_t runningDays = 0;
  uint32_t overDischargeCount = 0;
  uint32_t fullChargeCount = 0;
};

SmartWattData liveData;
uint16_t lastRegisters[MODBUS_REGISTER_COUNT] = {0};
bool lastResponseCrcOk = false;
uint16_t lastResponseLength = 0;
String lastModbusError = "Not started";
String lastRequestHex;
String lastResponseHex;
volatile uint32_t modbusErrors = 0;
volatile uint32_t modbusRetryCount = 0;
volatile bool dataUpdated = false;
volatile bool firstDiagnosticPending = MODBUS_DIAGNOSTIC_MODE;
volatile bool firstJbdDiagnosticPending = JBD_DIAGNOSTIC_MODE;
volatile uint32_t jbdLastPoll = 0;
volatile uint32_t jbdLastCellPoll = 0;
volatile bool jbdDataUpdated = false;

uint32_t lastWiFiAttempt = 0;
bool fallbackApStarted = false;
int lastApStationCount = -1;
uint32_t lastWsPush = 0;

Preferences preferences;
String staSsid;
String staPassword;
bool staPasswordStored = false;

static const uint16_t EXPECTED_NORMAL_RESPONSE = 1 + 1 + 1 + (MODBUS_REGISTER_COUNT * 2) + 2;

void logEvent(const char *fmt, ...) {
  char body[LOG_LINE_LENGTH - 24];
  va_list args;
  va_start(args, fmt);
  vsnprintf(body, sizeof(body), fmt, args);
  va_end(args);

  char line[LOG_LINE_LENGTH];
  snprintf(line, sizeof(line), "[%10lu ms] %s", (unsigned long)millis(), body);

  Serial.println(line);
  if (!logMutex) return;
  if (xSemaphoreTake(logMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
    strncpy(logLines[logWriteIndex], line, LOG_LINE_LENGTH - 1);
    logLines[logWriteIndex][LOG_LINE_LENGTH - 1] = '\0';
    logWriteIndex = (logWriteIndex + 1) % LOG_LINE_COUNT;
    if (logStoredCount < LOG_LINE_COUNT) ++logStoredCount;
    xSemaphoreGive(logMutex);
  }
}

void clearEventLog() {
  if (!logMutex) return;
  if (xSemaphoreTake(logMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    memset(logLines, 0, sizeof(logLines));
    logWriteIndex = 0;
    logStoredCount = 0;
    xSemaphoreGive(logMutex);
  }
  logEvent("[LOG] Event log cleared");
}

String getEventLogText() {
  String out;
  out.reserve(LOG_LINE_COUNT * 90);
  if (!logMutex) return out;
  if (xSemaphoreTake(logMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    uint16_t start = (logStoredCount < LOG_LINE_COUNT) ? 0 : logWriteIndex;
    for (uint16_t i = 0; i < logStoredCount; ++i) {
      uint16_t idx = (start + i) % LOG_LINE_COUNT;
      out += logLines[idx];
      out += '\n';
    }
    xSemaphoreGive(logMutex);
  }
  return out;
}

uint16_t modbusCRC16(const uint8_t *data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t pos = 0; pos < len; ++pos) {
    crc ^= data[pos];
    for (uint8_t i = 0; i < 8; i++) {
      if (crc & 0x0001) crc = (crc >> 1) ^ 0xA001;
      else crc >>= 1;
    }
  }
  return crc;
}

String bytesToHex(const uint8_t *data, size_t len) {
  String out;
  out.reserve(len * 3);
  char b[4];
  for (size_t i = 0; i < len; ++i) {
    snprintf(b, sizeof(b), "%02X", data[i]);
    if (i) out += ' ';
    out += b;
  }
  return out;
}

const char *modbusResultText(ModbusResult r) {
  switch (r) {
    case ModbusResult::OK: return "OK";
    case ModbusResult::TIMEOUT: return "Timeout";
    case ModbusResult::INVALID_LENGTH: return "Invalid response length";
    case ModbusResult::INVALID_SLAVE: return "Invalid slave ID";
    case ModbusResult::INVALID_FUNCTION: return "Invalid function";
    case ModbusResult::INVALID_BYTE_COUNT: return "Invalid byte count";
    case ModbusResult::CRC_ERROR: return "CRC error";
    case ModbusResult::EXCEPTION_RESPONSE: return "Modbus exception";
    default: return "Unknown";
  }
}

uint16_t regValue(const uint16_t *regs, uint16_t address) {
  if (address < MODBUS_START_REGISTER) return 0;
  const uint16_t idx = address - MODBUS_START_REGISTER;
  if (idx >= MODBUS_REGISTER_COUNT) return 0;
  return regs[idx];
}

uint32_t combineWords(uint16_t highWord, uint16_t lowWord) {
#if MODBUS_32BIT_HIGH_WORD_FIRST
  return (uint32_t(highWord) << 16) | lowWord;
#else
  return (uint32_t(lowWord) << 16) | highWord;
#endif
}

float decodePackedTemperatureByte(uint8_t raw) {
  // 0xFF is treated as unavailable. Signed int8 is the compatibility profile.
  if (raw == 0xFF) return NAN;
  return float(int8_t(raw));
}

String chargeStateText(uint8_t s) {
  switch (s) {
    case 0: return "NO_CHARGE";
    case 2: return "MPPT";
    case 3: return "EQUALIZING";
    case 4: return "BOOST";
    case 5: return "FLOAT";
    case 6: return "CURRENT_LIMIT";
    default: return "UNKNOWN";
  }
}

String faultCode(uint16_t mask) {
  if (mask == 0) return "E0";
  if (mask & (1U << 0)) return "E1";
  if (mask & (1U << 1)) return "E2";
  if (mask & (1U << 2)) return "E3";
  if (mask & (1U << 3)) return "E4";
  if (mask & (1U << 4)) return "E5";
  if (mask & (1U << 5)) return "E6";
  if (mask & (1U << 7)) return "E8";
  if (mask & (1U << 9)) return "E10";
  if (mask & (1U << 12)) return "E14";
  return "UNKNOWN";
}

String faultDescription(const String &code) {
  if (code == "E0") return "No fault";
  if (code == "E1") return "Battery deep discharge";
  if (code == "E2") return "System overvoltage";
  if (code == "E3") return "Low battery voltage warning";
  if (code == "E4") return "Load short circuit";
  if (code == "E5") return "Overload";
  if (code == "E6") return "Controller overheating";
  if (code == "E8") return "Solar panel overload";
  if (code == "E10") return "Solar panel overvoltage";
  if (code == "E14") return "Incorrect solar panel connection";
  return "Unknown fault bit";
}

bool plausible(float v, float minv, float maxv) {
  return isfinite(v) && v >= minv && v <= maxv;
}

void parseRegisters(const uint16_t *r, SmartWattData &d) {
  d.batterySoc = float(regValue(r, REGISTER_BATTERY_SOC));
  if (!plausible(d.batterySoc, 0, 100)) d.batterySoc = NAN;

  d.batteryVoltage = regValue(r, REGISTER_BATTERY_VOLTAGE) / 10.0f;
  if (!plausible(d.batteryVoltage, 0, 80)) d.batteryVoltage = NAN;

  d.batteryCurrent = float(int16_t(regValue(r, REGISTER_BATTERY_CURRENT))) / 100.0f;
  if (!plausible(d.batteryCurrent, -200, 200)) d.batteryCurrent = NAN;

  uint16_t packedTemp = regValue(r, REGISTER_TEMPERATURE_PACKED);
  d.controllerTemperature = decodePackedTemperatureByte((packedTemp >> 8) & 0xFF);
  d.batteryTemperature = decodePackedTemperatureByte(packedTemp & 0xFF);

  d.loadVoltage = regValue(r, REGISTER_LOAD_VOLTAGE) / 10.0f;
  d.loadCurrent = regValue(r, REGISTER_LOAD_CURRENT) / 100.0f;
  d.loadPower = float(regValue(r, REGISTER_LOAD_POWER));

  d.pvVoltage = regValue(r, REGISTER_PV_VOLTAGE) / 10.0f;
  d.pvCurrent = regValue(r, REGISTER_PV_CURRENT) / 100.0f;
  d.pvPower = (isfinite(d.pvVoltage) && isfinite(d.pvCurrent)) ? d.pvVoltage * d.pvCurrent : NAN;
  d.chargePower = float(regValue(r, REGISTER_CHARGE_POWER));

  d.batteryMinVoltage = regValue(r, REGISTER_BATTERY_MIN_VOLTAGE) / 10.0f;
  d.batteryMaxVoltage = regValue(r, REGISTER_BATTERY_MAX_VOLTAGE) / 10.0f;
  d.maxChargeCurrent = regValue(r, REGISTER_MAX_CHARGE_CURRENT) / 100.0f;
  d.maxLoadCurrent = regValue(r, REGISTER_MAX_LOAD_CURRENT) / 100.0f;
  d.maxChargePower = float(regValue(r, REGISTER_MAX_CHARGE_POWER));
  d.maxLoadPower = float(regValue(r, REGISTER_MAX_LOAD_POWER));

  d.dailyChargeAh = float(regValue(r, REGISTER_DAILY_CHARGE_AH));
  d.dailyLoadAh = float(regValue(r, REGISTER_DAILY_LOAD_AH));
  d.runningDays = regValue(r, REGISTER_RUNNING_DAYS);
  d.overDischargeCount = regValue(r, REGISTER_OVER_DISCHARGES);
  d.fullChargeCount = regValue(r, REGISTER_FULL_CHARGES);

  d.totalChargeAh = float(combineWords(regValue(r, REGISTER_TOTAL_CHARGE_AH_HI), regValue(r, REGISTER_TOTAL_CHARGE_AH_LO)));
  d.totalLoadAh = float(combineWords(regValue(r, REGISTER_TOTAL_LOAD_AH_HI), regValue(r, REGISTER_TOTAL_LOAD_AH_LO)));
  d.totalChargeWh = float(combineWords(regValue(r, REGISTER_TOTAL_CHARGE_WH_HI), regValue(r, REGISTER_TOTAL_CHARGE_WH_LO)));
  d.totalLoadWh = float(combineWords(regValue(r, REGISTER_TOTAL_LOAD_WH_HI), regValue(r, REGISTER_TOTAL_LOAD_WH_LO)));

  d.rawChargeStatus = regValue(r, REGISTER_CHARGE_LOAD_STATUS);
  d.chargeState = chargeStateText(d.rawChargeStatus & 0x00FF);
#if USE_PACKED_LOAD_STATUS
  d.loadEnabled = (d.rawChargeStatus & 0x8000) != 0;
  d.loadEnabledValid = true;
#else
  d.loadEnabled = regValue(r, REGISTER_LOAD_STATE) != 0;
  d.loadEnabledValid = true;
#endif

  d.rawFaultRegister = regValue(r, REGISTER_FAULT);
  d.online = true;
  d.timestamp = millis();
}

void flushModbusRx() {
  while (ModbusSerial.available()) ModbusSerial.read();
}

ModbusResult readHoldingRegisters(uint8_t slave, uint16_t startReg, uint16_t count, uint16_t *outRegs) {
  uint8_t req[8];
  req[0] = slave;
  req[1] = MODBUS_FUNCTION_READ;
  req[2] = highByte(startReg);
  req[3] = lowByte(startReg);
  req[4] = highByte(count);
  req[5] = lowByte(count);
  uint16_t crc = modbusCRC16(req, 6);
  req[6] = lowByte(crc);
  req[7] = highByte(crc);

  flushModbusRx();
  lastRequestHex = bytesToHex(req, sizeof(req));
#if DEBUG_RAW_MODBUS
  Serial.println("[MODBUS TX]");
  Serial.println(lastRequestHex);
#endif

  ModbusSerial.write(req, sizeof(req));
  ModbusSerial.flush();

  uint8_t rx[260];
  size_t rxLen = 0;
  uint32_t started = millis();
  uint32_t lastByteAt = started;

  while (millis() - started < MODBUS_TIMEOUT_MS) {
    while (ModbusSerial.available() && rxLen < sizeof(rx)) {
      rx[rxLen++] = uint8_t(ModbusSerial.read());
      lastByteAt = millis();
    }

    if (rxLen >= 5 && (rx[1] & 0x80)) break;
    if (rxLen >= 3) {
      const size_t expected = size_t(3) + rx[2] + 2;
      if (rxLen >= expected) break;
    }
    if (rxLen > 0 && millis() - lastByteAt > 20) break;
    vTaskDelay(pdMS_TO_TICKS(1));
  }

  lastResponseLength = rxLen;
  lastResponseHex = bytesToHex(rx, rxLen);
#if DEBUG_RAW_MODBUS
  Serial.println("[MODBUS RX]");
  if (rxLen) Serial.println(lastResponseHex); else Serial.println("<timeout>");
#endif

  if (rxLen == 0) {
    lastResponseCrcOk = false;
    return ModbusResult::TIMEOUT;
  }
  if (rxLen < 5) {
    lastResponseCrcOk = false;
    return ModbusResult::INVALID_LENGTH;
  }

  const uint16_t rxCrc = uint16_t(rx[rxLen - 2]) | (uint16_t(rx[rxLen - 1]) << 8);
  const uint16_t calc = modbusCRC16(rx, rxLen - 2);
  lastResponseCrcOk = (rxCrc == calc);
  if (!lastResponseCrcOk) return ModbusResult::CRC_ERROR;
  if (rx[0] != slave) return ModbusResult::INVALID_SLAVE;

  if (rx[1] == (MODBUS_FUNCTION_READ | 0x80)) {
    char ex[40];
    snprintf(ex, sizeof(ex), "Modbus exception 0x%02X", rx[2]);
    lastModbusError = ex;
    return ModbusResult::EXCEPTION_RESPONSE;
  }
  if (rx[1] != MODBUS_FUNCTION_READ) return ModbusResult::INVALID_FUNCTION;
  if (rx[2] != count * 2) return ModbusResult::INVALID_BYTE_COUNT;
  if (rxLen != size_t(3 + count * 2 + 2)) return ModbusResult::INVALID_LENGTH;

  for (uint16_t i = 0; i < count; ++i) {
    outRegs[i] = (uint16_t(rx[3 + i * 2]) << 8) | rx[4 + i * 2];
  }
  return ModbusResult::OK;
}

void markOffline() {
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    bool wasOnline = liveData.online;
    liveData.online = false;
    xSemaphoreGive(dataMutex);
    if (wasOnline) logEvent("[MODBUS] Controller OFFLINE");
  }
}

bool pollSmartWatt() {
  uint16_t regs[MODBUS_REGISTER_COUNT];
  for (uint8_t attempt = 0; attempt < MODBUS_RETRIES; ++attempt) {
    if (attempt > 0) {
      ++modbusRetryCount;
      logEvent("[MODBUS] Retry %u/%u", attempt + 1, MODBUS_RETRIES);
    }

    Serial.printf("[MODBUS] READ 0x%04X COUNT=%u\n", MODBUS_START_REGISTER, MODBUS_REGISTER_COUNT);
    ModbusResult r = readHoldingRegisters(MODBUS_SLAVE_ID, MODBUS_START_REGISTER, MODBUS_REGISTER_COUNT, regs);
    if (r == ModbusResult::OK) {
      SmartWattData parsed;
      parseRegisters(regs, parsed);

      if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        bool wasOnline = liveData.online;
        liveData = parsed;
        memcpy(lastRegisters, regs, sizeof(lastRegisters));
        lastModbusError = "OK";
        xSemaphoreGive(dataMutex);
        if (!wasOnline) logEvent("[MODBUS] Controller ONLINE");
      }
      dataUpdated = true;
      Serial.println("[MODBUS] Response OK");
      Serial.println("[MODBUS] CRC OK");
      return true;
    }

    ++modbusErrors;
    lastModbusError = modbusResultText(r);
    logEvent("[MODBUS] ERROR: %s", lastModbusError.c_str());
    vTaskDelay(pdMS_TO_TICKS(80));
  }

  markOffline();
  return false;
}

void printDiagnosticRegisters() {
  Serial.println("[DIAG] Register dump:");
  for (uint16_t i = 0; i < MODBUS_REGISTER_COUNT; ++i) {
    Serial.printf("REG 0x%04X = 0x%04X\n", MODBUS_START_REGISTER + i, lastRegisters[i]);
  }
}

int scanSmartWattSlaveId() {
#if ENABLE_MODBUS_SCAN
  Serial.println("[MODBUS] Read-only slave scan 1..247");
  uint16_t oneReg[1];
  for (int id = 1; id <= 247; ++id) {
    ModbusResult r = readHoldingRegisters(uint8_t(id), MODBUS_START_REGISTER, 1, oneReg);
    if (r == ModbusResult::OK) {
      Serial.printf("[MODBUS] Found slave ID: %d\n", id);
      return id;
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
  Serial.println("[MODBUS] No slave found");
#endif
  return -1;
}

void modbusTask(void *parameter) {
  (void)parameter;
#if ENABLE_MODBUS_SCAN
  scanSmartWattSlaveId();
#endif

  for (;;) {
    bool ok = pollSmartWatt();
    if (firstDiagnosticPending) {
      Serial.printf("[DIAG] Result: %s\n", ok ? "OK" : lastModbusError.c_str());
      Serial.printf("[DIAG] CRC: %s\n", lastResponseCrcOk ? "OK" : "FAIL/NO RESPONSE");
      if (ok) printDiagnosticRegisters();
      firstDiagnosticPending = false;
    }
    vTaskDelay(pdMS_TO_TICKS(MODBUS_POLL_INTERVAL_MS));
  }
}

void jbdTask(void *parameter) {
  (void)parameter;
  jbdBms.begin();
  logEvent("[JBD] UART started RX=%d TX=%d baud=%u", JBD_RX_PIN, JBD_TX_PIN, JBD_BAUDRATE);

  for (;;) {
    const uint32_t now = millis();
    bool basicOk = false;
    if (now - jbdLastPoll >= JBD_POLL_INTERVAL_MS) {
      jbdLastPoll = now;
      if (xSemaphoreTake(jbdMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        basicOk = jbdBms.pollBasic();
        xSemaphoreGive(jbdMutex);
      }
      if (basicOk) {
        jbdDataUpdated = true;
        if (firstJbdDiagnosticPending) {
          JbdDiagnostics jd; JbdData jbData;
          copyJbdDiagnostics(jd);
          copyJbdData(jbData);
          Serial.printf("[JBD DIAG] Basic: OK, CRC=%s, RX=%u\n", jd.lastCrcOk ? "OK" : "FAIL", jd.lastResponseLength);
          Serial.printf("[JBD DIAG] Cells=%u NTC=%u Protection=0x%04X FET=0x%02X\n", jbData.cellCount, jbData.ntcCount, jbData.protectionMask, jbData.fetStatus);
          firstJbdDiagnosticPending = false;
        }
      } else if (firstJbdDiagnosticPending) {
        JbdDiagnostics jd; copyJbdDiagnostics(jd);
        Serial.printf("[JBD DIAG] Basic ERROR: %s\n", jd.lastError.c_str());
        firstJbdDiagnosticPending = false;
      }
    }

    JbdData jbdSnapshot; copyJbdData(jbdSnapshot);
    if (now - jbdLastCellPoll >= JBD_CELL_POLL_INTERVAL_MS && jbdSnapshot.online) {
      jbdLastCellPoll = now;
      bool cellsOk = false;
      if (xSemaphoreTake(jbdMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        cellsOk = jbdBms.pollCells();
        xSemaphoreGive(jbdMutex);
      }
      if (cellsOk) jbdDataUpdated = true;
    }

    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void copyJbdData(JbdData &out) {
  if (!jbdMutex) { out = jbdBms.data(); return; }
  if (xSemaphoreTake(jbdMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    out = jbdBms.data();
    xSemaphoreGive(jbdMutex);
  }
}

void copyJbdDiagnostics(JbdDiagnostics &out) {
  if (!jbdMutex) { out = jbdBms.diagnostics(); return; }
  if (xSemaphoreTake(jbdMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    out = jbdBms.diagnostics();
    xSemaphoreGive(jbdMutex);
  }
}

String jbdOperationTextSnapshot(const JbdData &b) {
  if (b.protectionMask != 0) return "PROTECTION";
  if (b.chargeFetOn && b.dischargeFetOn) return "NORMAL";
  if (b.chargeFetOn) return "CHARGE_ONLY";
  if (b.dischargeFetOn) return "DISCHARGE_ONLY";
  return "FETS_OFF";
}

void jsonSetFloat(JsonObject obj, const char *key, float value) {
  if (isfinite(value)) obj[key] = value;
  else obj[key] = nullptr;
}

String buildFlatDataJson() {
  SmartWattData d;
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    d = liveData;
    xSemaphoreGive(dataMutex);
  }

  JsonDocument doc;
  JsonObject root = doc.to<JsonObject>();
  root["device"] = "SmartWatt MPPT 2440";
  root["online"] = d.online;
  root["wifi"] = (WiFi.status() == WL_CONNECTED);
  root["ip"] = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  root["timestamp"] = d.timestamp;
  root["dataAgeMs"] = d.timestamp ? (millis() - d.timestamp) : 0;

  if (isfinite(d.batterySoc)) root["batterySOC"] = d.batterySoc; else root["batterySOC"] = nullptr;
  jsonSetFloat(root, "batteryVoltage", d.batteryVoltage);
  jsonSetFloat(root, "batteryCurrent", d.batteryCurrent);
  jsonSetFloat(root, "batteryTemp", d.batteryTemperature);
  jsonSetFloat(root, "batteryMinVoltage", d.batteryMinVoltage);
  jsonSetFloat(root, "batteryMaxVoltage", d.batteryMaxVoltage);
  jsonSetFloat(root, "pvVoltage", d.pvVoltage);
  jsonSetFloat(root, "pvCurrent", d.pvCurrent);
  jsonSetFloat(root, "pvPower", d.pvPower);
  jsonSetFloat(root, "chargePower", d.chargePower);
  jsonSetFloat(root, "maxChargeCurrent", d.maxChargeCurrent);
  jsonSetFloat(root, "maxChargePower", d.maxChargePower);
  jsonSetFloat(root, "loadVoltage", d.loadVoltage);
  jsonSetFloat(root, "loadCurrent", d.loadCurrent);
  jsonSetFloat(root, "loadPower", d.loadPower);
  if (d.loadEnabledValid) root["loadState"] = d.loadEnabled; else root["loadState"] = nullptr;
  jsonSetFloat(root, "maxLoadCurrent", d.maxLoadCurrent);
  jsonSetFloat(root, "maxLoadPower", d.maxLoadPower);
  jsonSetFloat(root, "controllerTemp", d.controllerTemperature);
  root["chargeState"] = d.chargeState;
  root["fault"] = d.rawFaultRegister;
  root["faultCode"] = faultCode(d.rawFaultRegister);
  root["faultDescription"] = faultDescription(faultCode(d.rawFaultRegister));
  jsonSetFloat(root, "dailyChargeAh", d.dailyChargeAh);
  jsonSetFloat(root, "dailyLoadAh", d.dailyLoadAh);
  jsonSetFloat(root, "totalChargeAh", d.totalChargeAh);
  jsonSetFloat(root, "totalLoadAh", d.totalLoadAh);
  jsonSetFloat(root, "totalChargeWh", d.totalChargeWh);
  jsonSetFloat(root, "totalLoadWh", d.totalLoadWh);
  root["runningDays"] = d.runningDays;
  root["fullCharges"] = d.fullChargeCount;
  root["overDischarges"] = d.overDischargeCount;

  JbdData b;
  copyJbdData(b);
  root["bmsOnline"] = b.online;
  root["bmsDataAgeMs"] = b.timestamp ? (millis() - b.timestamp) : 0;
  jsonSetFloat(root, "bmsVoltage", b.voltage);
  jsonSetFloat(root, "bmsCurrent", b.current);
  jsonSetFloat(root, "bmsPower", b.power);
  jsonSetFloat(root, "bmsRemainingAh", b.remainingAh);
  jsonSetFloat(root, "bmsFullCapacityAh", b.fullCapacityAh);
  root["bmsCycles"] = b.cycles;
  root["bmsSOC"] = b.online ? b.soc : 0;
  root["bmsCellCount"] = b.cellCount;
  root["bmsNtcCount"] = b.ntcCount;
  jsonSetFloat(root, "bmsMinCellVoltage", b.minCellVoltage);
  jsonSetFloat(root, "bmsMaxCellVoltage", b.maxCellVoltage);
  jsonSetFloat(root, "bmsDeltaCellVoltage", b.deltaCellVoltage);
  jsonSetFloat(root, "bmsAverageCellVoltage", b.averageCellVoltage);
  root["bmsProtection"] = b.protectionMask;
  root["bmsProtectionText"] = jbdBms.protectionText(b.protectionMask);
  root["bmsFetStatus"] = b.fetStatus;
  root["bmsChargeFet"] = b.chargeFetOn;
  root["bmsDischargeFet"] = b.dischargeFetOn;
  root["bmsBalancing"] = b.balancing;
  root["bmsOperation"] = jbdOperationTextSnapshot(b);
  JsonArray cells = root["bmsCells"].to<JsonArray>();
  for (uint8_t i = 0; i < b.cellCount; ++i) cells.add(b.cells[i]);
  JsonArray temps = root["bmsTemperatures"].to<JsonArray>();
  for (uint8_t i = 0; i < b.ntcCount; ++i) {
    if (isfinite(b.temperatures[i])) temps.add(b.temperatures[i]); else temps.add(nullptr);
  }

  String out;
  serializeJson(doc, out);
  return out;
}

String buildStatusJson() {
  SmartWattData d;
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    d = liveData;
    xSemaphoreGive(dataMutex);
  }
  JsonDocument doc;
  doc["device"] = "SmartWatt MPPT 2440";
  doc["online"] = d.online;
  doc["wifi"] = WiFi.status() == WL_CONNECTED;
  doc["connected_ssid"] = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : "";
  doc["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  doc["sta_ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  doc["ap_enabled"] = fallbackApStarted;
  doc["ap_ip"] = fallbackApStarted ? WiFi.softAPIP().toString() : "";
  doc["modbus_errors"] = modbusErrors;
  doc["modbus_retries"] = modbusRetryCount;
  JbdData b; copyJbdData(b);
  JbdDiagnostics jd; copyJbdDiagnostics(jd);
  doc["bms_online"] = b.online;
  doc["bms_data_age_ms"] = b.timestamp ? millis() - b.timestamp : 0;
  doc["bms_requests"] = jd.requests;
  doc["bms_errors"] = jd.errors;
  doc["uptime_ms"] = millis();
  doc["data_age_ms"] = d.timestamp ? millis() - d.timestamp : 0;
  doc["firmware_version"] = SMARTWATT_FIRMWARE_VERSION;
  doc["free_heap"] = ESP.getFreeHeap();
  doc["min_free_heap"] = ESP.getMinFreeHeap();
  String out;
  serializeJson(doc, out);
  return out;
}

String buildRawJson() {
  uint16_t regs[MODBUS_REGISTER_COUNT];
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    memcpy(regs, lastRegisters, sizeof(regs));
    xSemaphoreGive(dataMutex);
  }
  JsonDocument doc;
  doc["slave_id"] = MODBUS_SLAVE_ID;
  doc["function"] = MODBUS_FUNCTION_READ;
  doc["start_register"] = "0x0100";
  doc["register_count"] = MODBUS_REGISTER_COUNT;
  JsonArray arr = doc["registers"].to<JsonArray>();
  for (uint16_t i = 0; i < MODBUS_REGISTER_COUNT; ++i) arr.add(regs[i]);
  doc["last_response_crc_ok"] = lastResponseCrcOk;
  doc["last_response_length"] = lastResponseLength;
  doc["last_modbus_error"] = lastModbusError;
  doc["request_hex"] = lastRequestHex;
  doc["response_hex"] = lastResponseHex;
  String out;
  serializeJson(doc, out);
  return out;
}

String buildConfigJson() {
  JsonDocument doc;
  doc["baudrate"] = MODBUS_BAUDRATE;
  doc["parity"] = "N";
  doc["stop_bits"] = 1;
  doc["slave_id"] = MODBUS_SLAVE_ID;
  doc["start_register"] = "0x0100";
  doc["register_count"] = MODBUS_REGISTER_COUNT;
  doc["poll_interval_ms"] = MODBUS_POLL_INTERVAL_MS;
  doc["timeout_ms"] = MODBUS_TIMEOUT_MS;
  doc["retries"] = MODBUS_RETRIES;
  doc["read_only"] = true;
  doc["jbd_enabled"] = ENABLE_JBD_BMS;
  doc["jbd_baudrate"] = JBD_BAUDRATE;
  doc["jbd_rx_pin"] = JBD_RX_PIN;
  doc["jbd_tx_pin"] = JBD_TX_PIN;
  doc["jbd_poll_interval_ms"] = JBD_POLL_INTERVAL_MS;
  doc["jbd_cell_poll_interval_ms"] = JBD_CELL_POLL_INTERVAL_MS;
  doc["http_port"] = HTTP_PORT;
  doc["websocket_port"] = WEBSOCKET_PORT;
  doc["wifi_reconnect_interval_ms"] = WIFI_RECONNECT_INTERVAL_MS;
  String out;
  serializeJson(doc, out);
  return out;
}

String buildEngineeringJson() {
  SmartWattData d;
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    d = liveData;
    xSemaphoreGive(dataMutex);
  }
  JsonDocument doc;
  doc["firmware"] = String(SMARTWATT_FIRMWARE_NAME) + " v" + SMARTWATT_FIRMWARE_VERSION;
  doc["uptime_ms"] = millis();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["min_free_heap"] = ESP.getMinFreeHeap();
  doc["heap_size"] = ESP.getHeapSize();
  doc["cpu_mhz"] = ESP.getCpuFreqMHz();
  doc["chip_model"] = ESP.getChipModel();
  doc["chip_revision"] = ESP.getChipRevision();
  doc["wifi_connected"] = WiFi.status() == WL_CONNECTED;
  doc["ssid"] = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : "";
  doc["configured_ssid"] = staSsid;
  doc["wifi_password_saved"] = staPasswordStored;
  doc["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  doc["sta_ip"] = WiFi.localIP().toString();
  doc["ap_enabled"] = fallbackApStarted;
  doc["ap_ip"] = fallbackApStarted ? WiFi.softAPIP().toString() : "";
  doc["controller_online"] = d.online;
  doc["data_age_ms"] = d.timestamp ? millis() - d.timestamp : 0;
  doc["modbus_errors"] = modbusErrors;
  doc["modbus_retries"] = modbusRetryCount;
  doc["last_modbus_error"] = lastModbusError;
  doc["crc_ok"] = lastResponseCrcOk;
  doc["response_length"] = lastResponseLength;
  doc["slave_id"] = MODBUS_SLAVE_ID;
  doc["baudrate"] = MODBUS_BAUDRATE;
  doc["poll_interval_ms"] = MODBUS_POLL_INTERVAL_MS;
  doc["http_port"] = HTTP_PORT;
  doc["websocket_port"] = WEBSOCKET_PORT;
  doc["wifi_reconnect_interval_ms"] = WIFI_RECONNECT_INTERVAL_MS;
  JbdData b; copyJbdData(b);
  JbdDiagnostics jd; copyJbdDiagnostics(jd);
  doc["bms_online"] = b.online;
  doc["bms_data_age_ms"] = b.timestamp ? millis() - b.timestamp : 0;
  doc["bms_voltage"] = b.voltage;
  doc["bms_current"] = b.current;
  doc["bms_soc"] = b.soc;
  doc["bms_cells"] = b.cellCount;
  doc["bms_ntcs"] = b.ntcCount;
  doc["bms_protection"] = b.protectionMask;
  doc["bms_protection_text"] = jbdBms.protectionText(b.protectionMask);
  doc["bms_charge_fet"] = b.chargeFetOn;
  doc["bms_discharge_fet"] = b.dischargeFetOn;
  doc["bms_balancing"] = b.balancing;
  doc["bms_operation"] = jbdOperationTextSnapshot(b);
  doc["jbd_rx_pin"] = JBD_RX_PIN;
  doc["jbd_tx_pin"] = JBD_TX_PIN;
  doc["jbd_baudrate"] = JBD_BAUDRATE;
  doc["jbd_requests"] = jd.requests;
  doc["jbd_successful"] = jd.successful;
  doc["jbd_errors"] = jd.errors;
  doc["jbd_timeouts"] = jd.timeouts;
  doc["jbd_crc_errors"] = jd.crcErrors;
  doc["jbd_protocol_errors"] = jd.protocolErrors;
  doc["jbd_basic_ok"] = jd.basicOk;
  doc["jbd_cells_ok"] = jd.cellsOk;
  doc["jbd_last_error"] = jd.lastError;
  doc["jbd_crc_ok"] = jd.lastCrcOk;
  doc["jbd_response_length"] = jd.lastResponseLength;
  doc["jbd_last_request_hex"] = jd.lastRequestHex;
  doc["jbd_last_response_hex"] = jd.lastResponseHex;
  doc["read_only"] = true;
  String out;
  serializeJson(doc, out);
  return out;
}

String buildDiagnosticDownload() {
  String out;
  out.reserve(14000);
  out += "SmartWatt Solar + JBD BMS Gateway v1.6.0 - diagnostic log\r\n";
  out += "=================================================\r\n";
  out += "Uptime ms: " + String(millis()) + "\r\n";
  out += "Free heap: " + String(ESP.getFreeHeap()) + "\r\n";
  out += "Min free heap: " + String(ESP.getMinFreeHeap()) + "\r\n";
  out += "WiFi: " + String(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED") + "\r\n";
  out += "STA IP: " + WiFi.localIP().toString() + "\r\n";
  out += "AP: " + String(fallbackApStarted ? "ON" : "OFF") + "\r\n";
  if (fallbackApStarted) out += "AP IP: " + WiFi.softAPIP().toString() + "\r\n";
  out += "Modbus errors: " + String(modbusErrors) + "\r\n";
  out += "Modbus retries: " + String(modbusRetryCount) + "\r\n";
  out += "Last Modbus error: " + lastModbusError + "\r\n";
  out += "Last CRC: " + String(lastResponseCrcOk ? "OK" : "FAIL/UNKNOWN") + "\r\n";
  out += "Last response length: " + String(lastResponseLength) + "\r\n";
  out += "\r\nLAST MODBUS TX\r\n" + lastRequestHex + "\r\n";
  out += "\r\nLAST MODBUS RX\r\n" + lastResponseHex + "\r\n";
  JbdData b; copyJbdData(b);
  JbdDiagnostics jd; copyJbdDiagnostics(jd);
  out += "\r\nJBD BMS\r\n";
  out += "Online: " + String(b.online ? "YES" : "NO") + "\r\n";
  out += "Voltage: " + String(b.voltage, 3) + " V\r\n";
  out += "Current: " + String(b.current, 3) + " A\r\n";
  out += "SOC: " + String(b.soc) + " %\r\n";
  out += "Cells: " + String(b.cellCount) + "\r\n";
  out += "NTCs: " + String(b.ntcCount) + "\r\n";
  out += "Protection: 0x" + String(b.protectionMask, HEX) + " " + jbdBms.protectionText(b.protectionMask) + "\r\n";
  out += "Charge FET: " + String(b.chargeFetOn ? "ON" : "OFF") + "\r\n";
  out += "Discharge FET: " + String(b.dischargeFetOn ? "ON" : "OFF") + "\r\n";
  out += "Balancing: " + String(b.balancing ? "ON" : "OFF") + "\r\n";
  out += "Remaining: " + String(b.remainingAh, 2) + " Ah\r\n";
  out += "Full capacity: " + String(b.fullCapacityAh, 2) + " Ah\r\n";
  out += "Min cell: " + String(b.minCellVoltage, 3) + " V\r\n";
  out += "Max cell: " + String(b.maxCellVoltage, 3) + " V\r\n";
  out += "Delta cell: " + String(b.deltaCellVoltage * 1000.0f, 1) + " mV\r\n";
  for (uint8_t i = 0; i < b.cellCount; ++i) out += "Cell " + String(i + 1) + ": " + String(b.cells[i], 3) + " V\r\n";
  for (uint8_t i = 0; i < b.ntcCount; ++i) {
    if (isfinite(b.temperatures[i])) out += "NTC " + String(i + 1) + ": " + String(b.temperatures[i], 1) + " C\r\n";
  }
  out += "Requests: " + String(jd.requests) + " Errors: " + String(jd.errors) + " Timeouts: " + String(jd.timeouts) + " CRC: " + String(jd.crcErrors) + "\r\n";
  out += "Last JBD error: " + jd.lastError + "\r\n";
  out += "Last JBD TX: " + jd.lastRequestHex + "\r\n";
  out += "Last JBD RX: " + jd.lastResponseHex + "\r\n";
  out += "\r\nEVENT LOG\r\n---------\r\n";
  out += getEventLogText();
  return out;
}


void loadWiFiCredentials() {
  preferences.begin("smartwatt", true);
  staSsid = preferences.getString("wifi_ssid", WIFI_SSID);
  staPassword = preferences.getString("wifi_pass", WIFI_PASSWORD);
  preferences.end();

  staSsid.trim();
  staPasswordStored = staPassword.length() > 0;
  logEvent("[WiFi] STA credentials loaded, SSID=%s, password=%s",
           staSsid.length() ? staSsid.c_str() : "<empty>",
           staPasswordStored ? "stored" : "empty");
}

bool saveWiFiCredentials(const String &ssid, const String &password) {
  if (ssid.length() == 0 || ssid.length() > 32) return false;
  if (password.length() > 63) return false;
  if (password.length() > 0 && password.length() < 8) return false;

  preferences.begin("smartwatt", false);
  size_t s1 = preferences.putString("wifi_ssid", ssid);
  size_t s2 = preferences.putString("wifi_pass", password);
  preferences.end();

  if (s1 == 0 || (password.length() > 0 && s2 == 0)) return false;
  staSsid = ssid;
  staPassword = password;
  staPasswordStored = password.length() > 0;
  return true;
}

String buildWiFiSettingsJson() {
  JsonDocument doc;
  doc["ssid"] = staSsid;
  doc["password_saved"] = staPasswordStored;
  doc["connected"] = WiFi.status() == WL_CONNECTED;
  doc["connected_ssid"] = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : "";
  doc["sta_ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  doc["ap_ssid"] = AP_SSID;
  doc["ap_ip"] = fallbackApStarted ? WiFi.softAPIP().toString() : "";
  doc["ap_clients"] = fallbackApStarted ? WiFi.softAPgetStationNum() : 0;
  doc["ap_channel"] = AP_CHANNEL;
  doc["ap_max_clients"] = AP_MAX_CLIENTS;
  doc["ap_dhcp"] = true;
  String out;
  serializeJson(doc, out);
  return out;
}

void connectToConfiguredWiFi() {
  if (staSsid.length() == 0) {
    logEvent("[WiFi] STA SSID is empty, keeping service AP");
    startFallbackAP();
    return;
  }

  startFallbackAP();
  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);

  logEvent("[WiFi] Connecting to configured SSID=%s; service AP stays active",
           staSsid.c_str());

  WiFi.begin(staSsid.c_str(), staPassword.c_str());
  lastWiFiAttempt = millis();
}

String buildBmsJson() {
  JbdData b; copyJbdData(b);
  JbdDiagnostics jd; copyJbdDiagnostics(jd);
  JsonDocument doc;
  doc["online"] = b.online;
  doc["data_age_ms"] = b.timestamp ? millis() - b.timestamp : 0;
  jsonSetFloat(doc.as<JsonObject>(), "voltage", b.voltage);
  jsonSetFloat(doc.as<JsonObject>(), "current", b.current);
  jsonSetFloat(doc.as<JsonObject>(), "power", b.power);
  jsonSetFloat(doc.as<JsonObject>(), "remaining_ah", b.remainingAh);
  jsonSetFloat(doc.as<JsonObject>(), "full_capacity_ah", b.fullCapacityAh);
  doc["soc"] = b.soc;
  doc["cycles"] = b.cycles;
  doc["cell_count"] = b.cellCount;
  doc["ntc_count"] = b.ntcCount;
  jsonSetFloat(doc.as<JsonObject>(), "min_cell_v", b.minCellVoltage);
  jsonSetFloat(doc.as<JsonObject>(), "max_cell_v", b.maxCellVoltage);
  jsonSetFloat(doc.as<JsonObject>(), "delta_cell_v", b.deltaCellVoltage);
  JsonArray cells = doc["cells"].to<JsonArray>();
  for (uint8_t i = 0; i < b.cellCount; ++i) cells.add(b.cells[i]);
  JsonArray temps = doc["temperatures"].to<JsonArray>();
  for (uint8_t i = 0; i < b.ntcCount; ++i) { if (isfinite(b.temperatures[i])) temps.add(b.temperatures[i]); else temps.add(nullptr); }
  doc["protection"] = b.protectionMask;
  doc["protection_text"] = jbdBms.protectionText(b.protectionMask);
  doc["operation"] = jbdOperationTextSnapshot(b);
  doc["charge_fet"] = b.chargeFetOn;
  doc["discharge_fet"] = b.dischargeFetOn;
  doc["balancing"] = b.balancing;
  doc["diagnostics"]["requests"] = jd.requests;
  doc["diagnostics"]["successful"] = jd.successful;
  doc["diagnostics"]["errors"] = jd.errors;
  doc["diagnostics"]["timeouts"] = jd.timeouts;
  doc["diagnostics"]["crc_errors"] = jd.crcErrors;
  doc["diagnostics"]["protocol_errors"] = jd.protocolErrors;
  doc["diagnostics"]["last_error"] = jd.lastError;
  doc["diagnostics"]["last_crc_ok"] = jd.lastCrcOk;
  doc["diagnostics"]["last_request_hex"] = jd.lastRequestHex;
  doc["diagnostics"]["last_response_hex"] = jd.lastResponseHex;
  String out; serializeJson(doc, out); return out;
}

void setupWebServer() {
  server.on("/api/health", HTTP_GET, []() {
    String out = "{\"ok\":true,\"firmware\":\"" + String(SMARTWATT_FIRMWARE_VERSION) + "\",\"uptime_ms\":" + String(millis()) + "}";
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json", out);
  });
  server.on("/api/version", HTTP_GET, []() {
    JsonDocument doc;
    doc["name"] = SMARTWATT_FIRMWARE_NAME;
    doc["version"] = SMARTWATT_FIRMWARE_VERSION;
    doc["web_ui"] = "Qwen React";
    doc["jbd"] = ENABLE_JBD_BMS;
    doc["jbd_read_only"] = true;
    String out; serializeJson(doc, out);
    server.send(200, "application/json", out);
  });
  server.on("/api/reboot", HTTP_POST, []() {
    server.send(200, "application/json", "{\"ok\":true,\"restarting\":true}");
    logEvent("[SYSTEM] Reboot requested via API");
    delay(100);
    ESP.restart();
  });
  server.on("/", HTTP_GET, []() {
    server.send_P(200, "text/html; charset=utf-8", INDEX_HTML);
  });
  server.on("/api/data", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    server.sendHeader("Pragma", "no-cache");
    server.send(200, "application/json", buildFlatDataJson());
  });
  server.on("/api/status", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    server.sendHeader("Pragma", "no-cache");
    server.send(200, "application/json", buildStatusJson());
  });
  server.on("/api/bms", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    server.sendHeader("Pragma", "no-cache");
    server.send(200, "application/json", buildBmsJson());
  });
  server.on("/api/raw", HTTP_GET, []() { server.send(200, "application/json", buildRawJson()); });
  server.on("/api/config", HTTP_GET, []() { server.send(200, "application/json", buildConfigJson()); });
  server.on("/api/engineering", HTTP_GET, []() { server.send(200, "application/json", buildEngineeringJson()); });
  server.on("/api/logs", HTTP_GET, []() { server.send(200, "text/plain; charset=utf-8", getEventLogText()); });
  server.on("/api/wifi", HTTP_GET, []() {
    server.send(200, "application/json", buildWiFiSettingsJson());
  });
  server.on("/api/wifi", HTTP_POST, []() {
    String ssid = server.arg("ssid");
    String password = server.arg("password");
    ssid.trim();

    if (ssid.length() == 0 || ssid.length() > 32) {
      server.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_ssid\"}");
      return;
    }
    if (password.length() > 0 && (password.length() < 8 || password.length() > 63)) {
      server.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_password\"}");
      return;
    }
    if (!saveWiFiCredentials(ssid, password)) {
      server.send(500, "application/json", "{\"ok\":false,\"error\":\"save_failed\"}");
      return;
    }

    logEvent("[WiFi] New STA settings saved, SSID=%s, password=<hidden>", ssid.c_str());
    server.send(200, "application/json", "{\"ok\":true,\"connecting\":true}");
    delay(30);
    connectToConfiguredWiFi();
  });
  server.on("/logs.txt", HTTP_GET, []() {
    server.sendHeader("Content-Disposition", "attachment; filename=smartwatt-diagnostics.txt");
    server.send(200, "text/plain; charset=utf-8", buildDiagnosticDownload());
  });
  server.on("/api/logs/clear", HTTP_POST, []() { clearEventLog(); server.send(200, "application/json", "{\"ok\":true}"); });
  server.on("/api/diagnostics/reset", HTTP_POST, []() { modbusErrors = 0; modbusRetryCount = 0; jbdBms.resetDiagnostics(); clearEventLog(); server.send(200, "application/json", "{\"ok\":true}"); });
  server.onNotFound([]() { server.send(404, "application/json", "{\"error\":\"not_found\"}"); });
  server.begin();
  Serial.printf("[HTTP] Server started on port %u\n", HTTP_PORT);
}

void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  (void)payload;
  (void)length;
  switch (type) {
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      logEvent("[WS] Client %u connected from %s", num, ip.toString().c_str());
      String payload = buildFlatDataJson();
      webSocket.sendTXT(num, payload);
      break;
    }
    case WStype_DISCONNECTED:
      logEvent("[WS] Client %u disconnected", num);
      break;
    default:
      break;
  }
}

void startFallbackAP() {
#if ENABLE_FALLBACK_AP
  if (fallbackApStarted) return;
  WiFi.mode(WIFI_AP_STA);
  IPAddress ip(AP_IP_A, AP_IP_B, AP_IP_C, AP_IP_D);
  IPAddress gw(AP_IP_A, AP_IP_B, AP_IP_C, AP_IP_D);
  IPAddress mask(AP_NETMASK_A, AP_NETMASK_B, AP_NETMASK_C, AP_NETMASK_D);

  // ESP32 SoftAP DHCP server is started automatically by WiFi.softAP().
  // softAPConfig() fixes the AP/gateway address and /24 network.
  if (!WiFi.softAPConfig(ip, gw, mask)) {
    logEvent("[WiFi] WARNING: softAPConfig failed");
  }

  if (WiFi.softAP(AP_SSID, AP_PASSWORD, AP_CHANNEL, 0, AP_MAX_CLIENTS)) {
    fallbackApStarted = true;
    logEvent("[WiFi] Fallback AP started: %s", AP_SSID);
    logEvent("[WiFi] AP gateway=%s mask=255.255.255.0 DHCP=enabled channel=%u max_clients=%u",
             WiFi.softAPIP().toString().c_str(), (unsigned)AP_CHANNEL, (unsigned)AP_MAX_CLIENTS);
    Serial.printf("[WiFi] AP SSID: %s\n", AP_SSID);
    Serial.printf("[WiFi] AP IP/Gateway: %s\n", WiFi.softAPIP().toString().c_str());
    Serial.printf("[WiFi] AP channel: %u\n", (unsigned)AP_CHANNEL);
    Serial.printf("[WiFi] AP DHCP: enabled, clients will receive 192.168.4.x addresses\n");
  } else {
    logEvent("[WiFi] Failed to start fallback AP");
  }
#endif
}

void connectWiFiInitial() {
  loadWiFiCredentials();

  // Service AP starts first and remains available even if router login fails.
  startFallbackAP();

  if (staSsid.length() == 0) {
    logEvent("[WiFi] No router SSID configured; AP-only service mode");
    return;
  }

  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);

  Serial.printf("[WiFi] Initial STA connect to %s...\n", staSsid.c_str());
  WiFi.begin(staSsid.c_str(), staPassword.c_str());
  lastWiFiAttempt = millis();

  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    logEvent("[WiFi] Connected, IP=%s", WiFi.localIP().toString().c_str());
  } else {
    logEvent("[WiFi] STA initial connection failed; service AP remains active");
  }
}

void maintainWiFi() {
  static wl_status_t lastStatus = WL_IDLE_STATUS;
  wl_status_t status = WiFi.status();

  if (status != lastStatus) {
    if (status == WL_CONNECTED) {
      logEvent("[WiFi] Connected, SSID=%s IP=%s RSSI=%d dBm",
               WiFi.SSID().c_str(),
               WiFi.localIP().toString().c_str(),
               WiFi.RSSI());
    } else if (lastStatus == WL_CONNECTED) {
      logEvent("[WiFi] STA connection lost; service AP remains active");
    }
    lastStatus = status;
  }

  // Service AP is the priority management interface.
  startFallbackAP();

  // Retry connection to the external router only when credentials exist,
  // and only once per minute to avoid disturbing AP clients.
  if (status != WL_CONNECTED &&
      staSsid.length() > 0 &&
      millis() - lastWiFiAttempt >= WIFI_RECONNECT_INTERVAL_MS) {
    lastWiFiAttempt = millis();

    logEvent("[WiFi] STA reconnect attempt to SSID=%s", staSsid.c_str());

    WiFi.mode(WIFI_AP_STA);
    WiFi.begin(staSsid.c_str(), staPassword.c_str());
  }
}

void setup() {
  Serial.begin(SERIAL_DEBUG_BAUD);
  delay(300);
  Serial.println();
  Serial.println("================================");
  Serial.println("SmartWatt Solar + JBD BMS Gateway v1.6.0");
  Serial.println("================================");
  Serial.println("[System] ESP32 starting");
  Serial.println("[System] READ ONLY firmware - Modbus Function 03 only");

  Serial.printf("[MODBUS] Configured Slave ID: %u\n", MODBUS_SLAVE_ID);
  Serial.printf("[MODBUS] Discovery ID: %u\n", MODBUS_DISCOVERY_ID);
  Serial.printf("[MODBUS] Baudrate: %u\n", MODBUS_BAUDRATE);
  Serial.println("[MODBUS] Format: 8N1");
  Serial.printf("[MODBUS] Start register: 0x%04X\n", MODBUS_START_REGISTER);
  Serial.printf("[MODBUS] Register count: %u\n", MODBUS_REGISTER_COUNT);

  dataMutex = xSemaphoreCreateMutex();
  jbdMutex = xSemaphoreCreateMutex();
  logMutex = xSemaphoreCreateMutex();
  if (!dataMutex || !jbdMutex || !logMutex) {
    Serial.println("[FATAL] Cannot create mutex");
    while (true) delay(1000);
  }
  logEvent("[SYSTEM] Boot v1.6.0, read-only Solar + JBD gateway");

  ModbusSerial.begin(MODBUS_BAUDRATE, SERIAL_8N1, RS232_RX_PIN, RS232_TX_PIN);
  Serial.printf("[JBD] UART1 RX=%d TX=%d baud=%u\n", JBD_RX_PIN, JBD_TX_PIN, JBD_BAUDRATE);
  connectWiFiInitial();

  setupWebServer();
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
  Serial.printf("[WS] WebSocket started on port %u\n", WEBSOCKET_PORT);

  BaseType_t ok = xTaskCreatePinnedToCore(modbusTask, "modbus", 6144, nullptr, 1, nullptr, 0);
  if (ok != pdPASS) {
    logEvent("[FATAL] Cannot start Modbus task");
  }
#if ENABLE_JBD_BMS
  BaseType_t jb = xTaskCreatePinnedToCore(jbdTask, "jbd", 6144, nullptr, 1, nullptr, 0);
  if (jb != pdPASS) {
    logEvent("[FATAL] Cannot start JBD task");
  }
#endif

  logEvent("[SYSTEM] Ready");
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WEB] http://%s/\n", WiFi.localIP().toString().c_str());
  }
  if (fallbackApStarted) {
    Serial.printf("[WEB] http://%s/\n", WiFi.softAPIP().toString().c_str());
  }
}

void loop() {
  server.handleClient();
  webSocket.loop();
#if ENABLE_FALLBACK_AP
  if (fallbackApStarted) {
    int apStations = WiFi.softAPgetStationNum();
    if (apStations != lastApStationCount) {
      lastApStationCount = apStations;
      logEvent("[WiFi] AP connected clients: %d", apStations);
    }
  }
#endif

  maintainWiFi();

  const uint32_t now = millis();
  if (dataUpdated || jbdDataUpdated || now - lastWsPush >= WEBSOCKET_INTERVAL_MS) {
    dataUpdated = false;
    jbdDataUpdated = false;
    lastWsPush = now;
    String payload = buildFlatDataJson();
    webSocket.broadcastTXT(payload);
  }

  delay(2);
}
