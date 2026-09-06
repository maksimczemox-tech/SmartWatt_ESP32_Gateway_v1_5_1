import { useMemo } from "react";
import { useData } from "../store/DataContext";
import { useSettings } from "../hooks/useSettings";
import { useNow } from "../hooks/useNow";
import { sunInfo, type SunInfo } from "../utils/sun";
import { estimatedLoadPower } from "../utils/energy";
import { deg, fmt, fmtTime, hm, num, ruNum } from "../utils/format";
import { Card, SubsystemChip } from "./ui";
import { Clock3, Sunrise, Sunset } from "lucide-react";

/**
 * Центральная энергетическая сцена.
 *
 * Модель энергетического БАЛАНСА с промежуточным узлом «ЭНЕРГЕТИЧЕСКАЯ ШИНА»:
 *
 *   СОЛНЕЧНЫЕ ПАНЕЛИ
 *           ↓
 *   ЭНЕРГЕТИЧЕСКАЯ ШИНА
 *        ↙       ↘
 *      АКБ      РАСЧЁТНАЯ НАГРУЗКА
 *
 * АКБ имеет одно nettо-направление в каждый момент:
 *   BMS > 0  → шина → АКБ (заряд)
 *   BMS < 0  → АКБ → шина (разряд)
 *   BMS = null → направление неизвестно («НЕТ ДАННЫХ»), поток не рисуется
 *
 * Одновременные «PV → АКБ» и «АКБ → нагрузка» никогда не показываются:
 * при заряде нагрузка питается от шины долей PV, при разряде АКБ отдаёт
 * энергию в шину вместе с PV.
 *
 * Расчётная нагрузка = max(0, PV − BMS); loadPower контроллера не используется.
 * Анимация зависит от реальной мощности; при отсутствии данных остановлена.
 */

const HORIZON_Y = 240;

function arcPoint(t: number): { x: number; y: number } {
  const P0 = { x: 80, y: HORIZON_Y };
  const PC = { x: 470, y: 28 };
  const P1 = { x: 860, y: HORIZON_Y };
  const u = 1 - t;
  return {
    x: u * u * P0.x + 2 * u * t * PC.x + t * t * P1.x,
    y: u * u * P0.y + 2 * u * t * PC.y + t * t * P1.y,
  };
}

/** Позиция Солнца: X — реальный азимут (восход→закат), Y — реальная высота. */
function sunVisualPos(sun: SunInfo): { x: number; y: number; below: boolean } | null {
  if (sun.polarNight) return null;

  let t: number | null = null;
  const srAz = sun.sunriseAzimuthDeg;
  const ssAz = sun.sunsetAzimuthDeg;

  if (sun.polarDay) {
    t = ((sun.azimuthDeg + 90) % 360) / 360;
  } else if (srAz !== null && ssAz !== null && ssAz > srAz && sun.elevationDeg >= 0) {
    t = Math.min(1, Math.max(0, (sun.azimuthDeg - srAz) / (ssAz - srAz)));
  } else {
    t = sun.daylightFraction;
  }
  if (t === null) t = 0.5;

  const below = sun.elevationDeg <= 0;
  const guide = arcPoint(t);
  if (below) {
    /* ниже горизонта: позиция по азимутальной направляющей, опущена под линию */
    return { x: guide.x, y: HORIZON_Y + (sun.phase === "TWILIGHT" ? 26 : 44), below };
  }
  const ratio = sun.maxElevationDeg > 1 ? Math.min(1, Math.max(0, sun.elevationDeg / sun.maxElevationDeg)) : 0;
  const y = HORIZON_Y - 26 - ratio * (HORIZON_Y - 96);
  return { x: guide.x, y, below };
}

function flowDur(w: number): number {
  return Math.min(2.4, Math.max(0.4, 2.3 - w / 150));
}
function flowWidth(w: number): number {
  return 1.6 + Math.min(5.4, w / 55);
}

function Flow({
  x1,
  y1,
  x2,
  y2,
  watts,
  color,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  watts: number | null;
  color: string;
}) {
  const active = watts !== null && watts > 0;
  const d = `M ${x1} ${y1} L ${x2} ${y2}`;
  return (
    <g>
      <path d={d} stroke="#1A2A35" strokeWidth={1.4} fill="none" />
      {active && (
        <path
          d={d}
          className="flow-anim"
          stroke={color}
          strokeWidth={flowWidth(watts)}
          strokeLinecap="round"
          strokeDasharray="9 13"
          fill="none"
          style={{ ["--dur" as string]: `${flowDur(watts)}s` }}
          opacity={0.95}
        />
      )}
    </g>
  );
}

const STARS = Array.from({ length: 26 }, (_, i) => ({
  x: ((i * 173.3) % 900) + 20,
  y: ((i * 97.7) % 240) + 18,
  r: 0.8 + ((i * 31) % 10) / 9,
  delay: (i % 7) * 0.6,
}));

export function EnergyScene() {
  const { data, bmsState, bat, espConfig } = useData();
  const now = useNow(1000);

  /* Координаты — из настроек Gateway (NVS), не из браузера. */
  const lat = num(espConfig?.latitude);
  const lon = num(espConfig?.longitude);

  const sun: SunInfo | null = useMemo(
    () => (lat !== null && lon !== null ? sunInfo(new Date(now), lat, lon) : null),
    [now, lat, lon],
  );

  const pv = num(data?.pvPower);
  const batt = bat.power;
  const load = estimatedLoadPower(pv, batt); /* max(0, PV − BMS) */
  const soc = bat.soc;
  const charging = batt !== null && batt > 0;
  const discharging = batt !== null && batt < 0;

  /* ---- потоки энергетического баланса (только реальные мощности) ---- */
  const flowPvBus = pv !== null && pv > 0 ? pv : null; /* PV → шина */
  const flowBusBatt = charging ? batt : null; /* шина → АКБ (заряд) */
  const flowBattBus = discharging ? Math.abs(batt as number) : null; /* АКБ → шина (разряд) */
  const flowBusLoad = load !== null && load > 0 ? load : null; /* шина → нагрузка */

  const busLive = flowPvBus !== null || charging || discharging || flowBusLoad !== null;

  const beamOn = pv !== null && pv > 0;
  const beamW = beamOn && pv !== null ? pv : 0; /* визуальный параметр линии, не данные */

  const sunPos = sun !== null ? sunVisualPos(sun) : null;
  const phase = sun?.phase ?? null;

  const battFill = soc === null ? null : Math.min(100, Math.max(0, soc));
  const battColor = charging ? "#70D900" : (battFill ?? 100) < 20 ? "#FF3D32" : (battFill ?? 100) < 45 ? "#FFC400" : "#70D900";

  /* подписи потоков */
  const pvLabel = pv === null ? "PV: НЕТ ДАННЫХ" : `PV → шина · ${fmt(pv, 0)} W`;
  const battLabel =
    batt === null
      ? "АКБ: НЕТ ДАННЫХ"
      : charging
        ? `заряд · ${fmt(batt, 0)} W`
        : discharging
          ? `разряд · ${fmt(Math.abs(batt), 0)} W`
          : `${fmt(batt, 0)} W`;
  const battLabelColor = batt === null ? "#8A969F" : charging ? "#70D900" : discharging ? "#FF3D32" : "#8A969F";
  const loadLabel = load === null ? "НЕТ ДАННЫХ" : `${fmt(load, 0)} W`;

  return (
    <svg viewBox="0 0 940 700" className="w-full h-auto block select-none" role="img" aria-label="Энергетическая система">
      <defs>
        <linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B2036" />
          <stop offset="100%" stopColor="#0C2136" />
        </linearGradient>
        <linearGradient id="skyDusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141226" />
          <stop offset="100%" stopColor="#3A2030" />
        </linearGradient>
        <linearGradient id="skyNight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#03060C" />
          <stop offset="100%" stopColor="#08101C" />
        </linearGradient>
        <radialGradient id="sunGlow">
          <stop offset="0%" stopColor="#FFC400" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#FFC400" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#FFC400" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sunCore">
          <stop offset="0%" stopColor="#FFF3C4" />
          <stop offset="55%" stopColor="#FFD34D" />
          <stop offset="100%" stopColor="#FFC400" />
        </radialGradient>
        <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#12283E" />
          <stop offset="100%" stopColor="#0B1B2B" />
        </linearGradient>
        <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0A141D" />
          <stop offset="100%" stopColor="#060C13" />
        </linearGradient>
      </defs>

      {/* небо */}
      <rect x="0" y="0" width="940" height={HORIZON_Y + 22} fill="url(#skyNight)" />
      <rect x="0" y="0" width="940" height={HORIZON_Y + 22} fill="url(#skyDay)" style={{ transition: "opacity 1.2s" }} opacity={phase === "DAY" ? 1 : 0.001} />
      <rect x="0" y="0" width="940" height={HORIZON_Y + 22} fill="url(#skyDusk)" style={{ transition: "opacity 1.2s" }} opacity={phase === "TWILIGHT" ? 1 : 0.001} />

      {/* звёзды */}
      <g style={{ opacity: phase === "NIGHT" ? 0.9 : phase === "TWILIGHT" ? 0.45 : 0, transition: "opacity 1.2s" }}>
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#C9D6E2" className="twinkle" style={{ animationDelay: `${s.delay}s` }} />
        ))}
      </g>

      {/* земля */}
      <rect x="0" y={HORIZON_Y + 22} width="940" height={700 - HORIZON_Y - 22} fill="url(#groundGrad)" />
      <line x1="0" y1={HORIZON_Y + 22} x2="940" y2={HORIZON_Y + 22} stroke="#1A2A35" strokeWidth="1.5" />

      {/* направляющая траектория: ВОСТОК → ЮГ → ЗАПАД */}
      <path d={`M 80 ${HORIZON_Y} Q 470 28 860 ${HORIZON_Y}`} fill="none" stroke="#27404F" strokeWidth="1.2" strokeDasharray="2 6" />
      <text x={74} y={HORIZON_Y + 16} fontSize={10} fill="#8A969F" className="svg-label" textAnchor="middle">ВОСТОК</text>
      <text x={470} y={20} fontSize={10} fill="#8A969F" className="svg-label" textAnchor="middle">ЮГ</text>
      <text x={866} y={HORIZON_Y + 16} fontSize={10} fill="#8A969F" className="svg-label" textAnchor="middle">ЗАПАД</text>

      {/* Солнце: позиция из реальных азимута и высоты */}
      {sun !== null && sunPos && (
        <g style={{ opacity: sunPos.below ? (sun.phase === "TWILIGHT" ? 0.4 : 0.22) : 1, transition: "opacity 1s" }}>
          <circle cx={sunPos.x} cy={sunPos.y} r={46} fill="url(#sunGlow)" className={sunPos.below ? "" : "sun-pulse"} />
          {!sunPos.below && (
            <g className="ray-spin">
              {Array.from({ length: 10 }, (_, i) => {
                const a = (i * Math.PI) / 5;
                return (
                  <line
                    key={i}
                    x1={sunPos.x + Math.cos(a) * 24}
                    y1={sunPos.y + Math.sin(a) * 24}
                    x2={sunPos.x + Math.cos(a) * 33}
                    y2={sunPos.y + Math.sin(a) * 33}
                    stroke="#FFC400"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity={0.75}
                  />
                );
              })}
            </g>
          )}
          <circle cx={sunPos.x} cy={sunPos.y} r={16} fill="url(#sunCore)" />
        </g>
      )}
      {sun !== null && sun.polarNight && (
        <text x="470" y="140" textAnchor="middle" fontSize={12} fill="#8A969F" className="svg-label">
          Полярная ночь — Солнце не восходит
        </text>
      )}
      {sun !== null && !sun.polarNight && sun.elevationDeg <= 0 && (
        <text x="470" y="140" textAnchor="middle" fontSize={12} fill="#8A969F" className="svg-label">
          Солнце за горизонтом
        </text>
      )}
      {sun === null && (
        <text x="470" y="140" textAnchor="middle" fontSize={12} fill="#8A969F" className="svg-label">
          Местоположение не задано — расчёт Солнца не выполняется
        </text>
      )}

      {/* луч Солнце → панели (только при реальной генерации) */}
      {sunPos && !sunPos.below && (
        <line
          x1={sunPos.x}
          y1={sunPos.y + 18}
          x2={470}
          y2={290}
          stroke="#FFC400"
          strokeWidth={beamOn ? flowWidth(beamW) : 1}
          strokeDasharray="3 9"
          className={beamOn ? "flow-anim" : ""}
          style={{ opacity: beamOn ? 0.85 : 0.12, transition: "opacity .8s", ...(beamOn ? { ["--dur" as string]: `${flowDur(beamW)}s` } : {}) }}
        />
      )}

      {/* ===== СОЛНЕЧНЫЕ ПАНЕЛИ (центр, под Солнцем) ===== */}
      <g>
        <polygon points="382,326 558,326 540,288 400,288" fill="url(#panelGrad)" stroke={beamOn ? "#FFC40088" : "#27404F"} strokeWidth="1.5" />
        {[1, 2, 3].map((i) => (
          <line key={`v${i}`} x1={400 + i * 35} y1={288 + i} x2={382 + i * 44} y2={326} stroke="#163450" strokeWidth="1" />
        ))}
        <line x1="394" y1="300.7" x2="546" y2="300.7" stroke="#163450" strokeWidth="1" />
        <line x1="388" y1="313.3" x2="552" y2="313.3" stroke="#163450" strokeWidth="1" />
        <rect x="463" y="326" width="14" height="20" fill="#101B25" stroke="#27404F" />
        <text x="470" y="274" textAnchor="middle" fontSize={11} fill="#8A969F" className="svg-label" letterSpacing="2">СОЛНЕЧНЫЕ ПАНЕЛИ</text>
        <text x="470" y="364" textAnchor="middle" fontSize={22} fill={beamOn ? "#FFC400" : "#8A969F"} className="svg-num" fontWeight={700}>
          {pv === null ? "—" : `${fmt(pv, 0)} W`}
        </text>
        <text x="470" y="382" textAnchor="middle" fontSize={11} fill="#8A969F" className="svg-num">
          {fmt(data?.pvVoltage, 1)} V · {fmt(data?.pvCurrent, 2)} A
        </text>
      </g>

      {/* ===== ЭНЕРГЕТИЧЕСКАЯ ШИНА ===== */}
      <g>
        {busLive && <rect x="330" y="450" width="280" height="14" rx="7" fill="none" stroke="#0878D1" strokeWidth="7" opacity="0.16" />}
        <rect x="330" y="450" width="280" height="14" rx="7" fill="#101B25" stroke={busLive ? "#0878D199" : "#27404F"} strokeWidth="1.5" style={{ transition: "stroke .5s" }} />
        <text x="470" y="460.5" textAnchor="middle" fontSize={9} letterSpacing="2.5" fill={busLive ? "#2F9BE8" : "#8A969F"} className="svg-label">
          ЭНЕРГЕТИЧЕСКАЯ ШИНА
        </text>
      </g>

      {/* ===== АККУМУЛЯТОР (ниже шины, слева) ===== */}
      <g>
        <rect x="271" y="492" width="28" height="8" rx="2" fill="#27404F" />
        <rect x="210" y="500" width="150" height="110" rx="6" fill="#101B25" stroke={charging ? "#70D90077" : "#27404F"} strokeWidth="1.5" />
        <clipPath id="battClip">
          <rect x="214" y="504" width="142" height="102" rx="4" />
        </clipPath>
        <g clipPath="url(#battClip)">
          {battFill !== null && (
            <rect
              x="214"
              width="142"
              y={504 + 102 - (102 * battFill) / 100}
              height={(102 * battFill) / 100}
              fill={battColor}
              opacity={0.5}
              style={{ transition: "y .8s ease, height .8s ease, fill .5s" }}
            />
          )}
          {charging && <rect x="214" y="504" width="142" height="28" fill="rgba(255,255,255,0.28)" className="charge-sheen" />}
        </g>
        <text x="285" y="546" textAnchor="middle" fontSize={24} fill="#F1F4F6" className="svg-num" fontWeight={700}>
          {soc === null ? "—" : `${fmt(soc, 0)}%`}
        </text>
        <text x="285" y="566" textAnchor="middle" fontSize={11.5} fill="#8A969F" className="svg-num">
          {fmt(bat.voltage, 2)} V · {fmt(bat.current, 2)} A
        </text>
        <text x="285" y="586" textAnchor="middle" fontSize={11.5} fill={charging ? "#70D900" : discharging ? "#FF3D32" : "#8A969F"} className="svg-num">
          {batt === null ? "нет данных" : `${batt > 0 ? "+" : ""}${fmt(batt, 0)} W ${charging ? "· заряд" : discharging ? "· разряд" : ""}`}
        </text>
        <text x="285" y="630" textAnchor="middle" fontSize={11} fill="#8A969F" className="svg-label" letterSpacing="2">АККУМУЛЯТОР</text>
      </g>

      {/* ===== РАСЧЁТНАЯ НАГРУЗКА (ниже шины, справа) ===== */}
      <g>
        <rect x="610" y="500" width="190" height="88" rx="6" fill="#101B25" stroke={flowBusLoad !== null ? "#FF3D3266" : "#27404F"} strokeWidth="1.5" />
        <circle cx="640" cy="544" r="13" fill="none" stroke={load !== null && load > 0 ? "#FF3D32" : "#27404F"} strokeWidth="2" />
        <circle cx="640" cy="544" r="4" fill={load !== null && load > 0 ? "#FF3D32" : "#27404F"} />
        <text x="716" y="538" textAnchor="middle" fontSize={22} fill={load !== null && load > 0 ? "#FF3D32" : "#8A969F"} className="svg-num" fontWeight={700}>
          {load === null ? "—" : `${fmt(load, 0)} W`}
        </text>
        <text x="716" y="558" textAnchor="middle" fontSize={9.5} fill="#8A969F" className="svg-label">источник: PV − АКБ</text>
        <text x="705" y="612" textAnchor="middle" fontSize={11} fill="#8A969F" className="svg-label" letterSpacing="2">РАСЧЁТНАЯ НАГРУЗКА</text>
      </g>

      {/* ===== потоки энергетического баланса ===== */}

      {/* PV → шина */}
      <Flow x1={470} y1={394} x2={470} y2={448} watts={flowPvBus} color="#FFC400" />
      <text x={482} y={426} fontSize={11} fill={pv !== null && pv > 0 ? "#FFC400" : "#8A969F"} className="svg-num">
        {pvLabel}
      </text>

      {/* шина → АКБ (только при заряде) */}
      <Flow x1={338} y1={458} x2={285} y2={490} watts={flowBusBatt} color="#70D900" />
      {/* АКБ → шина (только при разряде) */}
      <Flow x1={285} y1={490} x2={338} y2={458} watts={flowBattBus} color="#FF3D32" />
      <text x={306} y={474} textAnchor="end" fontSize={11} fill={battLabelColor} className="svg-num">
        {battLabel}
      </text>

      {/* шина → нагрузка */}
      <Flow x1={602} y1={458} x2={698} y2={496} watts={flowBusLoad} color="#FF3D32" />
      <text x={656} y={474} fontSize={11} fill={load !== null && load > 0 ? "#FF3D32" : "#8A969F"} className="svg-num">
        {loadLabel}
      </text>

      {/* строка состояния */}
      <text x="20" y="684" fontSize={10} fill="#8A969F" className="svg-label">
        BMS: {bmsState === "ONLINE" ? "В СЕТИ" : bmsState === "OFFLINE" ? "НЕТ СВЯЗИ" : bmsState === "STALE" ? "ДАННЫЕ УСТАРЕЛИ" : "НЕТ ДАННЫХ"}
        {"  ·  "}
        Темп. АКБ: {fmt(bat.temp, 1)} °C
      </text>
    </svg>
  );
}

/* ---------------- панель параметров Солнца ---------------- */

export function SunPanel() {
  const { espConfig } = useData();
  const now = useNow(1000);
  /* Координаты — из настроек Gateway (NVS), не из браузера. */
  const lat = num(espConfig?.latitude);
  const lon = num(espConfig?.longitude);
  const sun = useMemo(
    () => (lat !== null && lon !== null ? sunInfo(new Date(now), lat, lon) : null),
    [now, lat, lon],
  );

  if (sun === null) {
    return (
      <Card title="Положение Солнца" icon={<Sunrise size={13} />} delay={80}>
        <div className="text-[12px] text-mut leading-relaxed">
          Местоположение не задано.
          <div className="mt-1.5 text-[11px] text-mut/70">
            Укажите широту и долготу в разделе «Настройки» — расчёт выполняется локально
            (астрономическая модель, не данные Gateway).
          </div>
        </div>
      </Card>
    );
  }

  const phaseLabel = sun.phase === "DAY" ? "ДЕНЬ" : sun.phase === "TWILIGHT" ? "СУМЕРКИ" : "НОЧЬ";
  const phaseColor = sun.phase === "DAY" ? "#FFC400" : sun.phase === "TWILIGHT" ? "#FF9A4D" : "#8A969F";

  const rows: [string, string][] = [
    ["Азимут", deg(sun.azimuthDeg, 1)],
    ["Высота", deg(sun.elevationDeg, 1)],
    ["Восход", fmtTime(sun.sunriseTs)],
    ["Закат", fmtTime(sun.sunsetTs)],
    ["Солнечный полдень", fmtTime(sun.solarNoonTs)],
    ["Долгота дня", sun.dayLengthMs === null ? "—" : hm(sun.dayLengthMs / 3_600_000)],
    [
      sun.untilSunsetMs !== null
        ? "До заката"
        : sun.untilSunriseMs !== null
          ? "До восхода"
          : "Состояние",
      sun.untilSunsetMs !== null
        ? hm(sun.untilSunsetMs / 3_600_000)
        : sun.untilSunriseMs !== null
          ? hm(sun.untilSunriseMs / 3_600_000)
          : sun.polarNight
            ? "Полярная ночь"
            : sun.polarDay
              ? "Полярный день"
              : "Солнце за горизонтом",
    ],
  ];

  return (
    <Card
      title="Положение Солнца"
      icon={<Sunrise size={13} />}
      delay={80}
      right={
        <span
          className="inline-flex items-center gap-1.5 rounded-sm border px-2 py-[2px] text-[9.5px] font-semibold tracking-[0.12em]"
          style={{ color: phaseColor, borderColor: `${phaseColor}55`, backgroundColor: `${phaseColor}12` }}
        >
          {sun.phase === "DAY" ? <Sunrise size={10} /> : sun.phase === "TWILIGHT" ? <Clock3 size={10} /> : <Sunset size={10} />}
          {phaseLabel}
        </span>
      }
    >
      {sun.elevationDeg <= 0 && !sun.polarNight && (
        <div className="rounded-sm border border-line bg-panel2/60 px-2.5 py-1.5 text-[11px] text-mut mb-1.5">
          Солнце за горизонтом
        </div>
      )}
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 py-[5px] border-b border-line/60 last:border-0">
          <span className="text-[11px] text-mut">{k}</span>
          <span className="num text-[12.5px] text-ink">{v}</span>
        </div>
      ))}
      <div className="text-[9.5px] text-mut/70 mt-2 leading-relaxed">
        Расчётное значение: координаты {lat !== null ? ruNum(lat, 4) : "—"}°,{" "}
        {lon !== null ? ruNum(lon, 4) : "—"}° · часовой пояс браузера
        <span className="block mt-0.5">Координаты хранятся в памяти Gateway (NVS)</span>
      </div>
    </Card>
  );
}

/* мини-плитка состояния подсистемы для главной */
export function SysTile({ label, state }: { label: string; state: Parameters<typeof SubsystemChip>[0]["state"] }) {
  return (
    <div className="rounded border border-line bg-panel2/70 px-3 py-2.5 flex items-center justify-between gap-2">
      <span className="text-[10px] tracking-[0.12em] uppercase text-mut">{label}</span>
      <SubsystemChip state={state} />
    </div>
  );
}
