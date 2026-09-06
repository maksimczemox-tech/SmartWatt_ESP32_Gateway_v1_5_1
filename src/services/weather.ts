/**
 * Абстракция источника погоды (Weather Provider).
 *
 * Реально поддержан один провайдер — Open-Meteo:
 *   https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=cloud_cover
 * Он не требует API-ключа, поэтому секретов в настройках нет.
 *
 * Настройки (выбранный провайдер + координаты) хранятся на ESP32 (NVS)
 * и приходят через GET /api/config — браузер не является источником истины.
 *
 * Никакой погоды не выдумывается: нет провайдера/координат/ответа —
 * «НЕТ ДАННЫХ» или «ПОГОДА НЕДОСТУПНА».
 */

export type WeatherStatus =
  | "ok"
  | "no-data"
  | "unavailable"
  | "disabled"
  | "no-coords"
  | "loading";

export interface WeatherSnapshot {
  /** Облачность 0–100 % или null, если источник не предоставил значение. */
  cloudCover: number | null;
  fetchedAt: number;
}

export interface WeatherProvider {
  id: string;
  label: string;
  requiresApiKey: boolean;
  fetch(lat: number, lon: number): Promise<WeatherSnapshot>;
}

const OPEN_METEO: WeatherProvider = {
  id: "open-meteo",
  label: "Open-Meteo (без ключа)",
  requiresApiKey: false,
  async fetch(lat: number, lon: number): Promise<WeatherSnapshot> {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}` +
      `&longitude=${encodeURIComponent(String(lon))}&current=cloud_cover`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { current?: { cloud_cover?: unknown } };
    const raw = json.current?.cloud_cover;
    const n =
      typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100
        ? raw
        : null;
    return { cloudCover: n, fetchedAt: Date.now() };
  },
};

/** Реально поддерживаемые провайдеры. Не дополнять выдуманными API. */
export const WEATHER_PROVIDERS: WeatherProvider[] = [OPEN_METEO];

export function getWeatherProvider(id: string | null | undefined): WeatherProvider | null {
  if (!id) return null;
  return WEATHER_PROVIDERS.find((p) => p.id === id) ?? null;
}
