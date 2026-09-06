/**
 * Пользовательские настройки интерфейса.
 * Хранятся ТОЛЬКО в localStorage браузера и никогда не отправляются на ESP32
 * (соответствующего API в прошивке нет).
 * Это НЕ телеметрия.
 */

import { useCallback, useEffect, useState } from "react";
import type { ForecastMode } from "../utils/energy";

export interface UserSettings {
  lat: number | null;
  lon: number | null;
  /** Минимальный SOC для расчёта автономности, % (0–100, по умолчанию 20). */
  minSoc: number;
  /** Режим прогноза зарядки. */
  forecastMode: ForecastMode;
}

const KEY = "smartwatt:settings:v1";

const DEFAULTS: UserSettings = {
  lat: null,
  lon: null,
  minSoc: 20,
  /* предпочтительна средняя мощность заряда по реальным samples */
  forecastMode: "average",
};

function clampNum(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, v));
}

function load(): UserSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p: unknown = JSON.parse(raw);
    if (typeof p !== "object" || p === null) return DEFAULTS;
    const o = p as Record<string, unknown>;
    const lat = clampNum(o.lat, -90, 90);
    const lon = clampNum(o.lon, -180, 180);
    const minSoc = clampNum(o.minSoc, 0, 100) ?? DEFAULTS.minSoc;
    const forecastMode: ForecastMode =
      o.forecastMode === "average" ? "average" : "current";
    return {
      lat: lat ?? null,
      lon: lon ?? null,
      minSoc: Math.round(minSoc),
      forecastMode,
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(s: UserSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* localStorage недоступен — настройки живут до перезагрузки страницы */
  }
}

export function useSettings(): [UserSettings, (patch: Partial<UserSettings>) => void] {
  const [settings, setSettings] = useState<UserSettings>(load);

  useEffect(() => {
    persist(settings);
  }, [settings]);

  const update = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return [settings, update];
}
