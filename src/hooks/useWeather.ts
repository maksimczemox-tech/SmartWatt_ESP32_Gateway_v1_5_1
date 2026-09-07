/**
 * Погода по координатам, хранящимся на ESP32.
 * Только реально поддержанные провайдеры (см. services/weather.ts).
 * Отсутствующие данные никогда не заменяются нулями.
 */

import { useEffect, useState } from "react";
import { getWeatherProvider, type WeatherSnapshot, type WeatherStatus } from "../services/weather";

const REFRESH_MS = 10 * 60_000;

export interface WeatherState {
  status: WeatherStatus;
  cloudCover: number | null;
  fetchedAt: number | null;
  providerLabel: string | null;
}

export function useWeather(
  providerId: string | null | undefined,
  lat: number | null,
  lon: number | null,
): WeatherState {
  const [snap, setSnap] = useState<WeatherSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSnap(null);
    setFailed(false);
    setLoading(false);
    const provider = getWeatherProvider(providerId);
    if (!provider || lat === null || lon === null) return;

    let cancelled = false;
    const load = () => {
      setLoading(true);
      provider
        .fetch(lat, lon)
        .then((s) => {
          if (!cancelled) {
            setSnap(s);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [providerId, lat, lon]);

  const provider = getWeatherProvider(providerId);

  if (!provider) {
    return { status: "disabled", cloudCover: null, fetchedAt: null, providerLabel: null };
  }
  if (lat === null || lon === null) {
    return { status: "no-coords", cloudCover: null, fetchedAt: null, providerLabel: provider.label };
  }
  if (loading && snap === null) {
    return { status: "loading", cloudCover: null, fetchedAt: null, providerLabel: provider.label };
  }
  if (failed && snap === null) {
    return { status: "unavailable", cloudCover: null, fetchedAt: null, providerLabel: provider.label };
  }
  if (snap === null) {
    return { status: "loading", cloudCover: null, fetchedAt: null, providerLabel: provider.label };
  }
  return {
    status: snap.cloudCover === null ? "no-data" : "ok",
    cloudCover: snap.cloudCover,
    fetchedAt: snap.fetchedAt,
    providerLabel: provider.label,
  };
}
