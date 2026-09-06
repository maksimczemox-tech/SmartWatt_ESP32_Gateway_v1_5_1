#include "jbd_bms.h"
#include <math.h>

// Hardware note: JBD 4-pin UART connector is GND/RXD/TXD/VDD on pins 1/2/3/4.
// VDD is the BMS-side supply and is intentionally not connected to ESP32.
// UART is non-isolated; do not treat it as an isolated interface.

JbdBms::JbdBms(HardwareSerial &serial, int8_t rxPin, int8_t txPin,
               uint32_t baud, uint32_t timeoutMs)
    : serial_(serial), rxPin_(rxPin), txPin_(txPin), baud_(baud), timeoutMs_(timeoutMs) {}

void JbdBms::begin() {
  serial_.begin(baud_, SERIAL_8N1, rxPin_, txPin_);
  clearRx();
}

uint16_t JbdBms::checksum(const uint8_t *payload, size_t len) {
  uint32_t sum = 0;
  for (size_t i = 0; i < len; ++i) sum += payload[i];
  return uint16_t(0x10000u - (sum & 0xFFFFu));
}

String JbdBms::hex(const uint8_t *data, size_t len) {
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

void JbdBms::clearRx() {
  while (serial_.available()) serial_.read();
}

bool JbdBms::readRegister(uint8_t reg, uint8_t *payload, size_t payloadCapacity, size_t &payloadLen) {
  payloadLen = 0;
  ++diag_.requests;

  const uint8_t frameBase[2] = {reg, 0x00};
  const uint16_t chk = checksum(frameBase, sizeof(frameBase));
  uint8_t req[7] = {0xDD, 0xA5, reg, 0x00, uint8_t(chk >> 8), uint8_t(chk & 0xFF), 0x77};

  clearRx();
  diag_.lastRequestHex = hex(req, sizeof(req));
  serial_.write(req, sizeof(req));
  serial_.flush();

  uint8_t rx[160];
  size_t n = 0;
  const uint32_t started = millis();
  uint32_t lastByte = started;

  while (millis() - started < timeoutMs_) {
    while (serial_.available() && n < sizeof(rx)) {
      rx[n++] = uint8_t(serial_.read());
      lastByte = millis();
      if (n >= 2 && rx[n - 1] == 0x77) break;
    }
    if (n >= 2 && rx[n - 1] == 0x77) break;
    if (n && millis() - lastByte > 40) break;
    vTaskDelay(pdMS_TO_TICKS(1));
  }

  diag_.lastResponseLength = uint16_t(n);
  diag_.lastResponseHex = hex(rx, n);
  diag_.lastCrcOk = false;

  if (n == 0) {
    ++diag_.errors;
    ++diag_.timeouts;
    diag_.lastError = "Timeout";
    return false;
  }

  if (n < 7 || rx[0] != 0xDD || rx[n - 1] != 0x77) {
    ++diag_.errors;
    ++diag_.protocolErrors;
    diag_.lastError = "Invalid JBD frame";
    return false;
  }

  const uint8_t responseReg = rx[1];
  const uint8_t status = rx[2];
  const uint8_t len = rx[3];
  const size_t expected = size_t(7) + len;
  if (responseReg != reg) {
    ++diag_.errors;
    ++diag_.protocolErrors;
    diag_.lastError = "Unexpected register 0x" + String(responseReg, HEX);
    return false;
  }
  if (n != expected || size_t(len) > payloadCapacity) {
    ++diag_.errors;
    ++diag_.protocolErrors;
    diag_.lastError = "Invalid JBD payload length";
    return false;
  }

  // JBD response checksum covers STATUS + LENGTH + DATA.
  // The response register byte (0x03/0x04) is NOT part of the checksum.
  const uint16_t received = (uint16_t(rx[n - 3]) << 8) | rx[n - 2];
  const uint16_t calculated = checksum(&rx[2], size_t(2) + len);
  diag_.lastCrcOk = received == calculated;
  if (!diag_.lastCrcOk) {
    ++diag_.errors;
    ++diag_.crcErrors;
    diag_.lastError = "Checksum error";
    return false;
  }

  if (status != 0x00) {
    ++diag_.errors;
    ++diag_.protocolErrors;
    char msg[32];
    snprintf(msg, sizeof(msg), "BMS status 0x%02X", status);
    diag_.lastError = msg;
    return false;
  }

  memcpy(payload, &rx[4], len);
  payloadLen = len;
  ++diag_.successful;
  diag_.lastError = "OK";
  return true;
}

bool JbdBms::parseBasic(const uint8_t *p, size_t len) {
  if (len < 23) {
    diag_.lastError = "Basic info too short";
    ++diag_.errors;
    ++diag_.protocolErrors;
    return false;
  }

  const uint16_t packMv = (uint16_t(p[0]) << 8) | p[1];
  const int16_t packMa = int16_t((uint16_t(p[2]) << 8) | p[3]);
  const uint16_t remaining10mAh = (uint16_t(p[4]) << 8) | p[5];
  const uint16_t full10mAh = (uint16_t(p[6]) << 8) | p[7];
  const uint16_t cycles = (uint16_t(p[8]) << 8) | p[9];
  const uint16_t balanceLow = (uint16_t(p[12]) << 8) | p[13];
  const uint16_t balanceHigh = (uint16_t(p[14]) << 8) | p[15];
  const uint16_t protection = (uint16_t(p[16]) << 8) | p[17];

  data_.voltage = packMv / 100.0f;
  data_.current = packMa / 100.0f;
  data_.power = data_.voltage * data_.current;
  data_.remainingAh = remaining10mAh / 100.0f;
  data_.fullCapacityAh = full10mAh / 100.0f;
  data_.cycles = cycles;
  data_.balanceMaskLow = balanceLow;
  data_.balanceMaskHigh = balanceHigh;
  data_.protectionMask = protection;
  data_.softwareVersionRaw = p[18];
  data_.soc = p[19];
  data_.fetStatus = p[20];
  data_.cellCount = p[21];
  data_.ntcCount = p[22];
  data_.chargeFetOn = (data_.fetStatus & 0x01) != 0;
  data_.dischargeFetOn = (data_.fetStatus & 0x02) != 0;
  data_.balancing = (balanceLow != 0 || balanceHigh != 0);

  if (data_.cellCount > JBD_MAX_CELLS) data_.cellCount = JBD_MAX_CELLS;
  if (data_.ntcCount > JBD_MAX_TEMPS) data_.ntcCount = JBD_MAX_TEMPS;

  for (uint8_t i = 0; i < JBD_MAX_TEMPS; ++i) data_.temperatures[i] = NAN;
  const size_t tempBytes = size_t(data_.ntcCount) * 2;
  if (len >= 23 + tempBytes) {
    for (uint8_t i = 0; i < data_.ntcCount; ++i) {
      const size_t o = 23 + size_t(i) * 2;
      const uint16_t raw = (uint16_t(p[o]) << 8) | p[o + 1];
      data_.temperatures[i] = (raw == 0xFFFF) ? NAN : ((raw - 2731) / 10.0f);
    }
  }

  data_.timestamp = millis();
  data_.online = true;
  ++diag_.basicOk;
  return true;
}

bool JbdBms::parseCells(const uint8_t *p, size_t len) {
  const uint8_t count = uint8_t(len / 2);
  if (count == 0 || count > JBD_MAX_CELLS) {
    diag_.lastError = "Invalid cell count";
    ++diag_.errors;
    ++diag_.protocolErrors;
    return false;
  }

  data_.cellCount = count;
  float minV = 100.0f;
  float maxV = 0.0f;
  float sum = 0.0f;
  for (uint8_t i = 0; i < count; ++i) {
    const uint16_t mv = (uint16_t(p[i * 2]) << 8) | p[i * 2 + 1];
    data_.cells[i] = mv / 1000.0f;
    minV = min(minV, data_.cells[i]);
    maxV = max(maxV, data_.cells[i]);
    sum += data_.cells[i];
  }
  for (uint8_t i = count; i < JBD_MAX_CELLS; ++i) data_.cells[i] = NAN;
  data_.minCellVoltage = minV;
  data_.maxCellVoltage = maxV;
  data_.deltaCellVoltage = maxV - minV;
  data_.averageCellVoltage = sum / count;
  data_.timestamp = millis();
  data_.online = true;
  ++diag_.cellsOk;
  return true;
}

bool JbdBms::pollBasic() {
  uint8_t payload[64];
  size_t len = 0;
  if (!readRegister(0x03, payload, sizeof(payload), len)) {
    markOffline();
    return false;
  }
  const bool ok = parseBasic(payload, len);
  if (!ok) markOffline();
  return ok;
}

bool JbdBms::pollCells() {
  uint8_t payload[64];
  size_t len = 0;
  if (!readRegister(0x04, payload, sizeof(payload), len)) {
    // Keep basic telemetry online if only the optional cell request failed.
    return false;
  }
  return parseCells(payload, len);
}

bool JbdBms::pollAll() {
  const bool basic = pollBasic();
  if (!basic) return false;
  const bool cells = pollCells();
  return cells;
}

void JbdBms::markOffline() {
  data_.online = false;
}

String JbdBms::protectionText(uint16_t mask) const {
  if (mask == 0) return "NONE";
  String s;
  const char *names[] = {
    "CELL_OV", "CELL_UV", "PACK_OV", "PACK_UV",
    "CHG_OT", "CHG_UT", "DSG_OT", "DSG_UT",
    "CHG_OC", "DSG_OC", "SHORT", "AFE", "FET_LOCK"
  };
  for (uint8_t i = 0; i < 13; ++i) {
    if (mask & (1U << i)) {
      if (s.length()) s += ",";
      s += names[i];
    }
  }
  return s;
}

String JbdBms::operationText() const {
  if (data_.protectionMask != 0) return "PROTECTION";
  if (data_.chargeFetOn && data_.dischargeFetOn) return "NORMAL";
  if (data_.chargeFetOn) return "CHARGE_ONLY";
  if (data_.dischargeFetOn) return "DISCHARGE_ONLY";
  return "FETS_OFF";
}

void JbdBms::resetDiagnostics() {
  diag_.requests = 0;
  diag_.successful = 0;
  diag_.errors = 0;
  diag_.timeouts = 0;
  diag_.crcErrors = 0;
  diag_.protocolErrors = 0;
  diag_.basicOk = 0;
  diag_.cellsOk = 0;
  diag_.lastCrcOk = false;
  diag_.lastError = "reset";
  diag_.lastResponseLength = 0;
  diag_.lastRequestHex = "";
  diag_.lastResponseHex = "";
}
