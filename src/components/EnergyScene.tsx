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
 * Физическая схема: Солнечные панели → АКБ → Расчётная нагрузка.
 * Нагрузка подключена к аккумулятору, поэтому прямой линии PV → Нагрузка нет.
 *
 * Потоки (только реальные мощности, интенсивность и скорость зависят от W):
 *   Панели → АКБ   когда PV > 0 (заряд — мощность заряда; разряд — питание шины)
 *   АКБ → Нагрузка когда расчётная нагрузка > 0
 *
 * Анимация ничего не вычисляет и не создаёт значений.
 */

const HORIZON_Y = 318;

function arcPoint(t: number): { x: number; y: number } {
  const P0 = { x: 80, y: HORIZON_Y };
  const PC = { x: 470, y: 40 };
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
  curve = 0,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  watts: number | null;
  color: string;
  curve?: number;
}) {
  const active = watts !== null && watts > 0;
  const d =
    curve === 0
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - curve} ${x2} ${y2}`;
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
  const { data, bmsState, bat } = useData();
  const [settings] = useSettings();
  const now = useNow(1000);

  const sun: SunInfo | null = useMemo(
    () =>
      settings.lat !== null && settings.lon !== null
        ? sunInfo(new Date(now), settings.lat, settings.lon)
        : null,
    [now, settings.lat, settings.lon],
  );

  const pv = num(data?.pvPower);
  const batt = bat.power;
  const load = estimatedLoadPower(pv, batt);
  const soc = bat.soc;
  const charging = batt !== null && batt > 0;
  const discharging = batt !== null && batt < 0;

  const beamOn = pv !== null && pv > 0;
  const beamW = beamOn && pv !== null ? pv : 0; /* визуальный параметр линии, не данные */

  /*
   * Потоки строго по физической модели (нагрузка подключена к АКБ):
   *  A: PV > 0, АКБ заряжается      → Панели → АКБ (мощность заряда)
   *  B: PV > 0, АКБ разряжается     → Панели → система (доля PV) + АКБ → нагрузка;
   *                                   линия Панели → АКБ НЕ рисуется
   *  C: PV = 0, АКБ разряжается     → АКБ → нагрузка
   *  D: PV = null                   → поток PV не рисуется
   *  E: BMS power = null            → направление потока АКБ не определяется («Нет данных»)
   *  F: расчётная нагрузка          → max(0, PV − BMS); loadPower не используется
   */
  const flowCharge = batt !== null && batt > 0 && beamOn ? batt : null; /* A */
  const flowPvSys = discharging && beamOn && pv !== null ? pv : null; /* B: PV → система */
  const flowBL =
    batt !== null && batt < 0
      ? Math.abs(batt) /* B/C: доля АКБ в нагрузке */
      : batt !== null && batt > 0 && load !== null && load > 0
        ? load /* A: расчётная нагрузка при заряде */
        : null;

  const sunPos = sun !== null ? sunVisualPos(sun) : null;
  const phase = sun?.phase ?? null;

  const battFill = soc === null ? null : Math.min(100, Math.max(0, soc));
  const battColor = charging ? "#70D900" : (battFill ?? 100) < 20 ? "#FF3D32" : (battFill ?? 100) < 45 ? "#FFC400" : "#70D900";

  return (
    <svg viewBox="0 0 940 560" className="w-full h-auto block select-none" role="img" aria-label="Энергетическая система">
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
      <rect x="0" y={HORIZON_Y + 22} width="940" height={560 - HORIZON_Y - 22} fill="url(#groundGrad)" />
      <line x1="0" y1={HORIZON_Y + 22} x2="940" y2={HORIZON_Y + 22} stroke="#1A2A35" strokeWidth="1.5" />

      {/* направляющая траектория: ВОСТОК → ЮГ → ЗАПАД */}
      <path d={`M 80 ${HORIZON_Y} Q 470 40 860 ${HORIZON_Y}`} fill="none" stroke="#27404F" strokeWidth="1.2" strokeDasharray="2 6" />
      <text x={74} y={HORIZON_Y + 16} fontSize={10} fill="#8A969F" className="svg-label" textAnchor="middle">ВОСТОК</text>
      <text x={470} y={30} fontSize={10} fill="#8A969F" className="svg-label" textAnchor="middle">ЮГ</text>
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
        <text x="470" y="150" textAnchor="middle" fontSize={12} fill="#8A969F" className="svg-label">
          Полярная ночь — Солнце не восходит
        </text>
      )}
      {sun !== null && !sun.polarNight && sun.elevationDeg <= 0 && (
        <text x="470" y="150" textAnchor="middle" fontSize={12} fill="#8A969F" className="svg-label">
          Солнце за горизонтом
        </text>
      )}
      {sun === null && (
        <text x="470" y="150" textAnchor="middle" fontSize={12} fill="#8A969F" className="svg-label">
          Местоположение не задано — расчёт Солнца не выполняется
        </text>
      )}

      {/* луч Солнце → панели (только при реальной генерации) */}
      {sunPos && !sunPos.below && (
        <line
          x1={sunPos.x}
          y1={sunPos.y + 18}
          x2={196}
          y2={404}
          stroke="#FFC400"
          strokeWidth={beamOn ? flowWidth(beamW) : 1}
          strokeDasharray="3 9"
          className={beamOn ? "flow-anim" : ""}
          style={{ opacity: beamOn ? 0.85 : 0.12, transition: "opacity .8s", ...(beamOn ? { ["--dur" as string]: `${flowDur(beamW)}s` } : {}) }}
        />
      )}

      {/* ===== СОЛНЕЧНЫЕ ПАНЕЛИ (слева) ===== */}
      <g>
        <polygon points="106,408 286,408 268,368 124,368" fill="url(#panelGrad)" stroke={beamOn ? "#FFC40088" : "#27404F"} strokeWidth="1.5" />
        {[1, 2, 3].map((i) => (
          <line key={`v${i}`} x1={124 + i * 36} y1={368 + i * 1.5} x2={106 + i * 45} y2={408} stroke="#163450" strokeWidth="1" />
        ))}
        {[1, 2].map((i) => (
          <line key={`h${i}`} x1={115 + i * 4.5} y1={368 + i * 13.3} x2={277 - i * 4.5} y2={368 + i * 13.3} stroke="#163450" strokeWidth="1" />
        ))}
        <rect x="189" y="408" width="14" height="24" fill="#101B25" stroke="#27404F" />
        <text x="196" y="352" textAnchor="middle" fontSize={11} fill="#8A969F" className="svg-label" letterSpacing="2">СОЛНЕЧНАЯ ГЕНЕРАЦИЯ</text>
        <text x="196" y="456" textAnchor="middle" fontSize={22} fill={beamOn ? "#FFC400" : "#8A969F"} className="svg-num" fontWeight={700}>
          {pv === null ? "—" : `${fmt(pv, 0)} W`}
        </text>
        <text x="196" y="474" textAnchor="middle" fontSize={11} fill="#8A969F" className="svg-num">
          {fmt(data?.pvVoltage, 1)} V · {fmt(data?.pvCurrent, 2)} A
        </text>
      </g>

      {/* ===== АККУМУЛЯТОР (центр) ===== */}
      <g>
        <rect x="416" y="352" width="108" height="10" rx="3" fill="#27404F" />
        <rect x="400" y="362" width="140" height="112" rx="6" fill="#101B25" stroke={charging ? "#70D90077" : "#27404F"} strokeWidth="1.5" />
        <clipPath id="battClip">
          <rect x="404" y="366" width="132" height="104" rx="4" />
        </clipPath>
        <g clipPath="url(#battClip)">
          {battFill !== null && (
            <rect
              x="404"
              width="132"
              y={366 + 104 - (104 * battFill) / 100}
              height={(104 * battFill) / 100}
              fill={battColor}
              opacity={0.5}
              style={{ transition: "y .8s ease, height .8s ease, fill .5s" }}
            />
          )}
          {charging && <rect x="404" y="366" width="132" height="30" fill="rgba(255,255,255,0.28)" className="charge-sheen" />}
        </g>
        <text x="470" y="410" textAnchor="middle" fontSize={24} fill="#F1F4F6" className="svg-num" fontWeight={700}>
          {soc === null ? "—" : `${fmt(soc, 0)}%`}
        </text>
        <text x="470" y="430" textAnchor="middle" fontSize={11.5} fill="#8A969F" className="svg-num">
          {fmt(bat.voltage, 2)} V · {fmt(bat.current, 2)} A
        </text>
        <text x="470" y="448" textAnchor="middle" fontSize={11.5} fill={charging ? "#70D900" : discharging ? "#FF3D32" : "#8A969F"} className="svg-num">
          {batt === null ? "нет данных" : `${batt > 0 ? "+" : ""}${fmt(batt, 0)} W ${charging ? "· заряд" : discharging ? "· разряд" : ""}`}
        </text>
        <text x="470" y="498" textAnchor="middle" fontSize={11} fill="#8A969F" className="svg-label" letterSpacing="2">АККУМУЛЯТОР</text>
      </g>

      {/* ===== РАСЧЁТНАЯ НАГРУЗКА (справа) ===== */}
      <g>
        <rect x="660" y="380" width="180" height="84" rx="6" fill="#101B25" stroke={flowBL !== null ? "#FF3D3266" : "#27404F"} strokeWidth="1.5" />
        <circle cx="690" cy="422" r="13" fill="none" stroke={load !== null && load > 0 ? "#FF3D32" : "#27404F"} strokeWidth="2" />
        <circle cx="690" cy="422" r="4" fill={load !== null && load > 0 ? "#FF3D32" : "#27404F"} />
        <text x="766" y="416" textAnchor="middle" fontSize={22} fill={load !== null && load > 0 ? "#FF3D32" : "#8A969F"} className="svg-num" fontWeight={700}>
          {load === null ? "—" : `${fmt(load, 0)} W`}
        </text>
        <text x="766" y="436" textAnchor="middle" fontSize={9.5} fill="#8A969F" className="svg-label">источник: PV − АКБ</text>
        <text x="750" y="488" textAnchor="middle" fontSize={11} fill="#8A969F" className="svg-label" letterSpacing="2">РАСЧЁТНАЯ НАГРУЗКА</text>
      </g>

      {/* ===== потоки (физическая схема: панели → АКБ → нагрузка) ===== */}

      {/* A: Панели → АКБ, только когда АКБ заряжается */}
      <Flow x1={292} y1={412} x2={398} y2={412} watts={flowCharge} color="#70D900" />
      <text x={345} y={400} textAnchor="middle" fontSize={11} fill={flowCharge !== null && flowCharge > 0 ? "#70D900" : "#8A969F"} className="svg-num">
        {batt === null ? "Нет данных" : flowCharge !== null ? `заряд ${fmt(flowCharge, 0)} W` : "—"}
      </text>

      {/* B: Панели → система (доля PV в нагрузке), только когда АКБ разряжается */}
      <Flow x1={292} y1={392} x2={700} y2={380} watts={flowPvSys} color="#FFC400" curve={90} />
      <text x={496} y={300} textAnchor="middle" fontSize={11} fill={flowPvSys !== null && flowPvSys > 0 ? "#FFC400" : "#8A969F"} className="svg-num">
        {flowPvSys !== null && flowPvSys > 0 ? `PV → система ${fmt(flowPvSys, 0)} W` : ""}
      </text>

      {/* АКБ → Расчётная нагрузка */}
      <Flow x1={542} y1={420} x2={658} y2={420} watts={flowBL} color="#FF3D32" />
      <text x={600} y={442} textAnchor="middle" fontSize={11} fill={flowBL !== null && flowBL > 0 ? "#FF3D32" : "#8A969F"} className="svg-num">
        {batt === null ? "Нет данных" : flowBL !== null ? `${discharging ? "разряд " : ""}${fmt(flowBL, 0)} W` : "—"}
      </text>

      {/* строка состояния */}
      <text x="20" y="546" fontSize={10} fill="#8A969F" className="svg-label">
        BMS: {bmsState === "ONLINE" ? "В СЕТИ" : bmsState === "OFFLINE" ? "НЕТ СВЯЗИ" : bmsState === "STALE" ? "ДАННЫЕ УСТАРЕЛИ" : "НЕТ ДАННЫХ"}
        {"  ·  "}
        Темп. АКБ: {fmt(bat.temp, 1)} °C
        {discharging && pv !== null && pv > 0 ? "  ·  PV + АКБ → нагрузка" : ""}
      </text>
    </svg>
  );
}

/* ---------------- панель параметров Солнца ---------------- */

export function SunPanel() {
  const [settings] = useSettings();
  const now = useNow(1000);
  const sun = useMemo(
    () =>
      settings.lat !== null && settings.lon !== null
        ? sunInfo(new Date(now), settings.lat, settings.lon)
        : null,
    [now, settings.lat, settings.lon],
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
        Расчётное значение: координаты {settings.lat !== null ? ruNum(settings.lat, 4) : "—"}°,{" "}
        {settings.lon !== null ? ruNum(settings.lon, 4) : "—"}° · часовой пояс браузера
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
