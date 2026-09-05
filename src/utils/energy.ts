/**
 * Расчетные показатели энергосистемы.
 * Все расчеты — только из реальных значений Gateway; при недостающих
 * данных возвращается честное состояние, а не выдуманное число.
 *
 * ФИЗИКА (согласно прошивке v1.6.x):
 *   Нагрузка подключена к аккумулятору, а не к выходу LOAD контроллера.
 *   bmsPower > 0 → аккумулятор ЗАРЯЖАЕТСЯ
 *   bmsPower < 0 → аккумулятор РАЗРЯЖАЕТСЯ
 *   Расчетная нагрузка = max(0, pvPower − bmsPower)
 */

import type { SamplePoint } from "../types";

/** Расчетная нагрузка: max(0, PV − BMS). Любое слагаемое неизвестно → null. */
export function estimatedLoadPower(
  pvPower: number | null,
  bmsPower: number | null,
): number | null {
  if (pvPower === null || bmsPower === null) return null;
  return Math.max(0, pvPower - bmsPower);
}

/* ---------------- прогноз до полной зарядки ---------------- */

export type ForecastMode = "current" | "average";

export type ChargeForecast =
  | {
      kind: "ok";
      hours: number;
      powerUsed: number;
      mode: ForecastMode;
      note?: string;
      remainingAh: number;
      remainingWh: number;
    }
  | { kind: "not-charging" }
  | { kind: "full" }
  | { kind: "stale" }
  | { kind: "insufficient"; reason?: string };

/**
 * Средняя мощность заряда ТОЛЬКО по реально полученным samples.
 * Между samples значения не генерируются.
 */
export function averageChargePower(
  samples: SamplePoint[],
  windowMs = 15 * 60_000,
): { avg: number | null; count: number } {
  const cutoff = Date.now() - windowMs;
  let sum = 0;
  let count = 0;
  for (const s of samples) {
    if (!s.valid || s.ts < cutoff) continue;
    if (s.batt !== null && s.batt > 0) {
      sum += s.batt;
      count += 1;
    }
  }
  return { avg: count > 0 ? sum / count : null, count };
}

export function chargeForecast(input: {
  soc: number | null;
  remainingAh: number | null;
  fullAh: number | null;
  voltage: number | null;
  currentPower: number | null;
  samples: SamplePoint[];
  mode: ForecastMode;
  bmsStale: boolean;
}): ChargeForecast {
  const { soc, remainingAh, fullAh, voltage, currentPower, samples, mode, bmsStale } = input;

  if (bmsStale) return { kind: "stale" };
  if (soc === null || remainingAh === null || fullAh === null || voltage === null) {
    return { kind: "insufficient", reason: "Нет ёмкости или напряжения BMS" };
  }
  if (soc >= 100) return { kind: "full" };

  let powerUsed: number | null = null;
  let note: string | undefined;

  if (mode === "average") {
    const { avg, count } = averageChargePower(samples);
    if (avg !== null && avg > 0 && count >= 3) {
      powerUsed = avg;
    } else {
      /* недостаточно реальных samples — используем текущую мощность */
      powerUsed = currentPower;
      note = "Недостаточно образцов — используется текущая мощность";
    }
  } else {
    powerUsed = currentPower;
  }

  if (powerUsed === null || powerUsed <= 0) return { kind: "not-charging" };

  const remainingWh = Math.max(0, fullAh - remainingAh) * voltage;
  const hours = remainingWh / powerUsed;

  return {
    kind: "ok",
    hours,
    powerUsed,
    mode,
    note,
    remainingAh: Math.max(0, fullAh - remainingAh),
    remainingWh,
  };
}

/* ---------------- автономность ---------------- */

export type Autonomy =
  | { kind: "ok"; hours: number; usableWh: number; minSoc: number }
  | { kind: "no-load" }
  | { kind: "below-min"; minSoc: number }
  | { kind: "insufficient" };

/**
 * Автономность: энергия между текущим SOC и пользовательским минимумом,
 * делённая на расчетную нагрузку. Только реальные данные.
 */
export function autonomy(input: {
  soc: number | null;
  fullAh: number | null;
  voltage: number | null;
  loadW: number | null;
  minSoc: number;
}): Autonomy {
  const { soc, fullAh, voltage, loadW, minSoc } = input;
  if (soc === null || fullAh === null || voltage === null) return { kind: "insufficient" };
  if (loadW === null || loadW <= 0) return { kind: "no-load" };
  if (soc <= minSoc) return { kind: "below-min", minSoc };
  const usableAh = (fullAh * (soc - minSoc)) / 100;
  const usableWh = usableAh * voltage;
  return { kind: "ok", hours: usableWh / loadW, usableWh, minSoc };
}
