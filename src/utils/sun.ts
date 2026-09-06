/**
 * Астрономический расчёт положения Солнца.
 * Источники: широта/долгота (задаёт пользователь, localStorage) +
 * текущая дата/время + часовой пояс браузера.
 *
 * Никаких данных с ESP32 здесь не используется и не подменяется.
 * Если координаты не заданы — расчёт не выполняется (null).
 *
 * Алгоритм — стандартное NOAA-приближение (уравнение времени + склонение).
 */

export type SunPhase = "DAY" | "TWILIGHT" | "NIGHT";

export interface SunInfo {
  /** Высота над горизонтом, ° (отрицательная — под горизонтом). */
  elevationDeg: number;
  /** Азимут, ° от севера по часовой (восток ≈ 90°, юг ≈ 180°, запад ≈ 270°). */
  azimuthDeg: number;
  /** Локальные timestamp'ы (null — полярный день/ночь). */
  sunriseTs: number | null;
  sunsetTs: number | null;
  solarNoonTs: number | null;
  dayLengthMs: number | null;
  phase: SunPhase;
  /** До восхода (только до восхода), иначе null. */
  untilSunriseMs: number | null;
  /** До заката (только когда Солнце взошло), иначе null. */
  untilSunsetMs: number | null;
  /** Доля светового дня 0..1 (null — ночь или полярные условия). */
  daylightFraction: number | null;
  polarNight: boolean;
  polarDay: boolean;
  /** Азимут восхода / заката, ° (null — полярные условия). */
  sunriseAzimuthDeg: number | null;
  sunsetAzimuthDeg: number | null;
  /** Максимальная высота Солнца в этот день (в солнечный полдень), °. */
  maxElevationDeg: number;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function sunInfo(date: Date, latDeg: number, lonDeg: number): SunInfo {
  const year = date.getFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const dayOfYear = (date.getTime() - startOfYear) / 86_400_000 + 1;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;

  const gamma = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1);

  /* Уравнение времени, минуты. */
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  /* Склонение Солнца, радианы. */
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const lat = latDeg * RAD;
  const tzOffMin = -date.getTimezoneOffset();

  /* ----- восход / закат (в минутах UTC) ----- */
  const cosH =
    Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);

  let sunriseTs: number | null = null;
  let sunsetTs: number | null = null;
  let solarNoonTs: number | null = null;
  let dayLengthMs: number | null = null;
  let polarNight = false;
  let polarDay = false;

  const noonUtcMin = 720 - 4 * lonDeg - eqtime;
  solarNoonTs = Date.UTC(year, date.getMonth(), date.getDate()) + noonUtcMin * 60_000;

  if (cosH > 1) {
    polarNight = true;
  } else if (cosH < -1) {
    polarDay = true;
  } else {
    const hDeg = Math.acos(cosH) * DEG;
    const sunriseUtcMin = 720 - 4 * (lonDeg + hDeg) - eqtime;
    const sunsetUtcMin = 720 - 4 * (lonDeg - hDeg) - eqtime;
    const base = Date.UTC(year, date.getMonth(), date.getDate());
    sunriseTs = base + sunriseUtcMin * 60_000;
    sunsetTs = base + sunsetUtcMin * 60_000;
    dayLengthMs = (sunsetUtcMin - sunriseUtcMin) * 60_000;
    /* переход через полночь (долгота далеко от пояса) — корректируем дату */
    if (sunsetTs < sunriseTs) sunsetTs += 86_400_000;
  }

  /* ----- текущие высота и азимут ----- */
  const utcMin =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = utcMin + eqtime + 4 * lonDeg; /* истинное солнечное время, мин */
  const haDeg = tst / 4 - 180; /* часовой угол */
  const ha = haDeg * RAD;

  const cosZenith =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const elevationDeg = 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) * DEG;

  let azimuthDeg =
    Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) *
      DEG +
    180;
  if (azimuthDeg < 0) azimuthDeg += 360;
  /* atan2 даёт азимут от юга в некоторых формулировках; нормализуем: утро → восток */
  if (haDeg < 0 && azimuthDeg > 180) azimuthDeg -= 360;
  if (azimuthDeg < 0) azimuthDeg += 360;

  /* ----- фаза ----- */
  const phase: SunPhase =
    elevationDeg > 0 ? "DAY" : elevationDeg > -6 ? "TWILIGHT" : "NIGHT";

  const now = date.getTime();
  const untilSunriseMs = sunriseTs !== null && now < sunriseTs ? sunriseTs - now : null;
  const untilSunsetMs =
    sunriseTs !== null && sunsetTs !== null && now >= sunriseTs && now < sunsetTs
      ? sunsetTs - now
      : null;

  const daylightFraction =
    sunriseTs !== null && sunsetTs !== null && sunsetTs > sunriseTs
      ? Math.min(1, Math.max(0, (now - sunriseTs) / (sunsetTs - sunriseTs)))
      : null;

  /* для корректного отображения используем локальное смещение только в подписях;
     метки времени уже локальны через Date */
  void tzOffMin;

  /* ----- азимут восхода/заката и максимальная высота ----- */
  let sunriseAzimuthDeg: number | null = null;
  let sunsetAzimuthDeg: number | null = null;
  if (!polarNight && !polarDay) {
    const h0 = -0.833 * RAD;
    const cosAz =
      (Math.sin(decl) - Math.sin(h0) * Math.sin(lat)) / (Math.cos(h0) * Math.cos(lat));
    const az0 = Math.acos(Math.min(1, Math.max(-1, cosAz))) * DEG;
    sunriseAzimuthDeg = az0;
    sunsetAzimuthDeg = 360 - az0;
  }

  /* высота в солнечный полдень (часовой угол = 0) */
  const sinNoon = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl);
  const maxElevationDeg = Math.asin(Math.min(1, Math.max(-1, sinNoon))) * DEG;

  return {
    elevationDeg,
    azimuthDeg,
    sunriseTs,
    sunsetTs,
    solarNoonTs,
    dayLengthMs,
    phase,
    untilSunriseMs,
    untilSunsetMs,
    daylightFraction,
    polarNight,
    polarDay,
    sunriseAzimuthDeg,
    sunsetAzimuthDeg,
    maxElevationDeg,
  };
}
