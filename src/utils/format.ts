/**
 * Утилиты отображения значений.
 * Железное правило: null / undefined / NaN / отсутствующее поле => "—".
 * Никакой подмены нулём или "красивыми" числами.
 */

export const DASH = "—";

/** Вернуть конечное число или null. */
export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Привести boolean-подобное значение (bool / 0|1 / "on"|"off") к boolean или null. */
export function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number" && Number.isFinite(v)) return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["on", "true", "1", "yes", "enabled"].includes(s)) return true;
    if (["off", "false", "0", "no", "disabled"].includes(s)) return false;
  }
  return null;
}

export function isMissing(v: unknown): boolean {
  return num(v) === null && toBool(v) === null && (v === null || v === undefined || v === "");
}

/** Число с фиксированным знаком, либо "—". */
export function fmt(v: unknown, digits = 1): string {
  const n = num(v);
  if (n === null) return DASH;
  return n.toFixed(digits);
}

/** Число + единица измерения, либо "—". */
export function unit(v: unknown, digits: number, u: string): string {
  const n = num(v);
  if (n === null) return DASH;
  return `${n.toFixed(digits)} ${u}`;
}

/** Число со знаком (+/-) + единица, либо "—". */
export function signed(v: unknown, digits: number, u: string): string {
  const n = num(v);
  if (n === null) return DASH;
  const s = n > 0 ? "+" : "";
  return `${s}${n.toFixed(digits)} ${u}`;
}

export function pct(v: unknown, digits = 0): string {
  const n = num(v);
  if (n === null) return DASH;
  return `${n.toFixed(digits)}%`;
}

export function int(v: unknown): string {
  const n = num(v);
  if (n === null) return DASH;
  return Math.round(n).toString();
}

/** Wh → kWh — математическое преобразование единиц, разрешено спецификацией. */
export function kwh(wh: unknown, digits = 2): string {
  const n = num(wh);
  if (n === null) return DASH;
  return `${(n / 1000).toFixed(digits)} kWh`;
}

/** Байты → КБ. */
export function kbytes(v: unknown): string {
  const n = num(v);
  if (n === null) return DASH;
  return `${(n / 1024).toFixed(1)} KB`;
}

/** Строка как есть, либо "—". */
export function str(v: unknown): string {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s === "" ? DASH : s;
}

export function boolChip(v: unknown): "ON" | "OFF" | null {
  const b = toBool(v);
  if (b === null) return null;
  return b ? "ON" : "OFF";
}

/** Timestamp (сек или мс) → мс. Некорректный → null. */
export function normTs(v: unknown): number | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

export function fmtTime(ms: number | null): string {
  if (ms === null) return DASH;
  const d = new Date(ms);
  const p = (x: number) => x.toString().padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtDateTime(ms: number | null): string {
  if (ms === null) return DASH;
  const d = new Date(ms);
  const p = (x: number) => x.toString().padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "только что", "12 с назад", "3 мин назад", "2 ч назад". */
export function ago(now: number, ts: number | null): string {
  if (ts === null) return DASH;
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return "только что";
  if (s < 60) return `${s} с назад`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}

/** Длительность: "3 д 4 ч" / "1 ч 12 м" / "45 с". */
export function dur(ms: unknown): string {
  const n = num(ms);
  if (n === null) return DASH;
  const s = Math.floor(n / 1000);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} м ${s % 60} с`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч ${m % 60} м`;
  const d = Math.floor(h / 24);
  return `${d} д ${h % 24} ч`;
}

/** Возраст данных: "0.8 с" / "45 с" / "3 мин". */
export function age(ms: unknown): string {
  const n = num(ms);
  if (n === null) return DASH;
  if (n < 1000) return `${Math.round(n)} мс`;
  if (n < 60000) return `${(n / 1000).toFixed(1)} с`;
  return `${Math.floor(n / 60000)} мин`;
}

export function clampPct(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return Math.min(100, Math.max(0, n));
}

/** Первое определённое значение из списка. */
export function firstDef<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
