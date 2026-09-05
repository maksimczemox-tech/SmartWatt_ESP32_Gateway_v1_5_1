/**
 * HTTP-клиент существующего SmartWatt ESP32 Gateway.
 * Новые endpoint'ы не придумываются — только реальные маршруты Gateway:
 *   GET  /api/health /api/version /api/data /api/status /api/bms
 *        /api/raw /api/config /api/engineering /api/logs /api/wifi
 *   POST /api/reboot /api/wifi /api/logs/clear /api/diagnostics/reset
 *
 * Адрес Gateway конфигурируется через VITE_GATEWAY_URL.
 * Если переменная не задана — используются same-origin запросы
 * (фронтенд открыт непосредственно с ESP32).
 *
 * DATA_SOURCE всегда "live": mock-адаптер в production отсутствует полностью.
 */

export const DATA_SOURCE: "live" = "live";

const ENV_URL = (import.meta.env.VITE_GATEWAY_URL ?? "").trim().replace(/\/+$/, "");

/** Базовый URL Gateway: "" означает same-origin. */
export const GATEWAY_BASE: string = ENV_URL;

export function apiBase(): string {
  return GATEWAY_BASE;
}

export function apiOriginLabel(): string {
  if (GATEWAY_BASE) return GATEWAY_BASE;
  try {
    return window.location.origin + " (локально)";
  } catch {
    return "(локально)";
  }
}

/** WebSocket Gateway работает на порту 81. */
export function wsUrl(): string {
  const override = (import.meta.env.VITE_GATEWAY_WS_URL ?? "").trim();
  if (override) return override;
  let host = "";
  if (GATEWAY_BASE) {
    try {
      host = new URL(GATEWAY_BASE).hostname;
    } catch {
      host = GATEWAY_BASE.replace(/^https?:\/\//, "").split("/")[0];
    }
  } else {
    try {
      host = window.location.hostname;
    } catch {
      host = "localhost";
    }
  }
  return `ws://${host}:81`;
}

/* ---- счётчики сессии (реальные значения: сколько запросов сделал фронтенд) ---- */

export const httpStats = {
  requests: 0,
  errors: 0,
};

export class ApiError extends Error {
  status: number;
  path: string;
  constructor(path: string, status: number, message: string) {
    super(message);
    this.path = path;
    this.status = status;
  }
}

const TIMEOUT_MS = 7000;

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  httpStats.requests += 1;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GATEWAY_BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      httpStats.errors += 1;
      throw new ApiError(path, res.status, `HTTP ${res.status}`);
    }
    const text = await res.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      httpStats.errors += 1;
      throw new ApiError(path, res.status, "Invalid JSON");
    }
  } catch (e) {
    if (!(e instanceof ApiError)) {
      httpStats.errors += 1;
      throw new ApiError(path, 0, e instanceof Error ? e.message : "Network error");
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>("GET", path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body);
  },
};
