#pragma once

#include <Arduino.h>

// JBD / Jiabaida read-only UART driver.
// Protocol: 9600 8N1, DD A5 <register> 00 <checksum> 77.
// No write commands are implemented in this driver.

static constexpr uint8_t JBD_MAX_CELLS = 16;
static constexpr uint8_t JBD_MAX_TEMPS = 8;

struct JbdData {
  bool online = false;
  uint32_t timestamp = 0;

  float voltage = NAN;
  float current = NAN;
  float power = NAN;
  float remainingAh = NAN;
  float fullCapacityAh = NAN;
  uint16_t cycles = 0;
  uint8_t soc = 0;
  uint8_t cellCount = 0;
  uint8_t ntcCount = 0;

  float cells[JBD_MAX_CELLS] = {NAN};
  float temperatures[JBD_MAX_TEMPS] = {NAN};
  float minCellVoltage = NAN;
  float maxCellVoltage = NAN;
  float deltaCellVoltage = NAN;
  float averageCellVoltage = NAN;

  uint16_t balanceMaskLow = 0;
  uint16_t balanceMaskHigh = 0;
  uint16_t protectionMask = 0;
  uint8_t fetStatus = 0;
  uint8_t softwareVersionRaw = 0;

  bool chargeFetOn = false;
  bool dischargeFetOn = false;
  bool balancing = false;
};

struct JbdDiagnostics {
  uint32_t requests = 0;
  uint32_t successful = 0;
  uint32_t errors = 0;
  uint32_t timeouts = 0;
  uint32_t crcErrors = 0;
  uint32_t protocolErrors = 0;
  uint32_t basicOk = 0;
  uint32_t cellsOk = 0;

  uint16_t lastResponseLength = 0;
  bool lastCrcOk = false;
  String lastError = "Not started";
  String lastRequestHex;
  String lastResponseHex;
};

class JbdBms {
public:
  JbdBms(HardwareSerial &serial, int8_t rxPin, int8_t txPin,
          uint32_t baud = 9600, uint32_t timeoutMs = 500);

  void begin();
  bool pollBasic();
  bool pollCells();
  bool pollAll();

  const JbdData &data() const { return data_; }
  const JbdDiagnostics &diagnostics() const { return diag_; }
  void resetDiagnostics();
  String protectionText(uint16_t mask) const;
  String operationText() const;

private:
  HardwareSerial &serial_;
  int8_t rxPin_;
  int8_t txPin_;
  uint32_t baud_;
  uint32_t timeoutMs_;
  JbdData data_;
  JbdDiagnostics diag_;

  static uint16_t checksum(const uint8_t *payload, size_t len);
  static String hex(const uint8_t *data, size_t len);
  void clearRx();
  bool readRegister(uint8_t reg, uint8_t *payload, size_t payloadCapacity, size_t &payloadLen);
  bool parseBasic(const uint8_t *p, size_t len);
  bool parseCells(const uint8_t *p, size_t len);
  void markOffline();
};
