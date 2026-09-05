import { useMemo } from "react";
import { useData } from "../store/DataContext";
import { useSettings } from "../hooks/useSettings";
import { useNow } from "../hooks/useNow";
import { sunInfo, type SunInfo } from "../utils/sun";
import { estimatedLoadPower } from "../utils/energy";
import { deg, fmt, fmtTime, hm, num, ruNum } from "../utils/format";
import { Card, SubsystemChip } from "./ui";
import { Clock3, Sunrise, Sunset } from "lucide-react";

/* ---------------- вспомогательная геометрия ---------------- */

const P0 = { x: 80, y: 318 };
const PC = { x: 470, y: 34 };
const P1 = { x: 860, y: 318 };

function arcPoint(t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * P0.x + 2 * u * t * PC.x + t * t * P1.x,
    y: u * u * P0.y + 2 * u * t * PC.y + t * t * P1.y,
  };
}

/** Скорость потока: больше мощность → быстрее частицы. */
function flowDur(w: number): number {
  return Math.min(2.4, Math.max(0.4, 2.3 - w / 150));
}
/** Толщина потока: больше мощность → толще линия. */
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
      : `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - curve} ${x2} ${y2}`;
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

function FlowLabel({ x, y, watts, color, text }: { x: number; y: number; watts: number | null; color: string; text: string }) {
  const active = watts !== null && watts > 0;
  return (
    <text x={x} y={y} textAnchor="middle" className="svg-num" fontSize={11.5} fill={active ? color : "#8A969F"}>
      {text} {watts === null ? "—" : `${fmt(watts, 0)} W`}
    </text>
  );
}

/* ---------------- детерминированные звёзды (декор, не данные) ---------------- */

const STARS = Array.from({ length: 26 }, (_, i) => ({
  x: ((i * 173.3) % 900) + 20,
  y: ((i * 97.7) % 240) + 18,
  r: 0.8 + ((i * 31) % 10) / 9,
  delay: (i % 7) * 0.6,
}));

/* ---------------- сцена ---------------- */

export function EnergyScene() {
  const { data, bmsState } = useData();
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
  const batt = num(data?.bmsPower);
  const load = estimatedLoadPower(pv, batt);
  const socPct = num(data?.batterySOC ?? data?.bmsSOC);
  const charging = (batt ?? 0) > 0;

  const beamOn = pv !== null && pv > 0;
  const flowPB = charging ? batt : null; // панели → АКБ
  const flowBL = batt !== null && batt < 0 ? Math.abs(batt) : null; // АКБ → нагрузка
  const direct = load !== null && pv !== null && load > 0 && pv > 0 ? Math.min(load, pv) : null;

  const sunPos = sun?.daylightFraction !== null && sun?.daylightFraction !== undefined ? arcPoint(sun.daylightFraction) : null;
  const phase = sun?.phase ?? null;

  const battFill = socPct === null ? 0 : Math.min(100, Math.max(0, socPct));
  const battColor = charging ? "#70D900" : battFill < 20 ? "#FF3D32" : battFill < 45 ? "#FFC400" : "#70D900";

  return (
    <svg viewBox="0 0 940 540" className="w-full h-auto block select-none" role="img" aria-label="Энергетическая система">
      <defs>
        <linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B2036" />
          <stop offset="70%" stopColor="#0A1A2C" />
          <stop offset="100%" stopColor="#0C2136" />
        </linearGradient>
        <linearGradient id="skyDusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141226" />
          <stop offset="65%" stopColor="#241731" />
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

      {/* небо по фазе (плавный переход) */}
      <rect x="0" y="0" width="940" height="340" fill="url(#skyDay)" style={{ transition: "opacity 1.2s" }} opacity={phase === "DAY" ? 1 : 0.001} />
      <rect x="0" y="0" width="940" height="340" fill="url(#skyDusk)" style={{ transition: "opacity 1.2s" }} opacity={phase === "TWILIGHT" ? 1 : 0.001} />
      <rect x="0" y="0" width="940" height="340" fill="url(#skyNight)" />

      {/* звёзды (ночь/сумерки) */}
      <g style={{ opacity: phase === "NIGHT" ? 0.9 : phase === "TWILIGHT" ? 0.45 : 0, transition: "opacity 1.2s" }}>
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#C9D6E2" className="twinkle" style={{ animationDelay: `${s.delay}s` }} />
        ))}
      </g>

      {/* земля */}
      <rect x="0" y="340" width="940" height="200" fill="url(#groundGrad)" />
      <line x1="0" y1="340" x2="940" y2="340" stroke="#1A2A35" strokeWidth="1.5" />

      {/* траектория Солнца: ВОСТОК → ЮГ → ЗАПАД */}
      <path d={`M ${P0.x} ${P0.y} Q ${PC.x} ${PC.y} ${P1.x} ${P1.y}`} fill="none" stroke="#27404F" strokeWidth="1.2" strokeDasharray="2 6" />
      <text x={P0.x - 6} y={P0.y + 18} fontSize={10} fill="#8A969F" className="svg-label" textAnchor="middle">ВОСТОК</text>
      <text x={470} y={PC.y - 10} fontSize={10} fill="#8A969F" className="svg-label" textAnchor="middle">ЮГ</text>
      <text x={P1.x + 6} y={P1.y + 18} fontSize={10} fill="#8A969F" className="svg-label" textAnchor="middle">ЗАПАД</text>

      {/* Солнце (позиция = реальное время + координаты) */}
      {sunPos && sun && (
        <g style={{ opacity: phase === "NIGHT" ? 0 : 1, transition: "opacity 1s" }}>
          <circle cx={sunPos.x} cy={sunPos.y} r={46} fill="url(#sunGlow)" className="sun-pulse" />
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
          <circle cx={sunPos.x} cy={sunPos.y} r={16} fill="url(#sunCore)" />
        </g>
      )}
      {sun === null && (
        <text x="470" y="150" textAnchor="middle" fontSize={12} fill="#8A969F" className="svg-label">
          Местоположение не задано — расчёт Солнца не выполняется
        </text>
      )}

      {/* луч Солнце → панели */}
      {sunPos && (
        <g style={{ opacity: beamOn ? 0.85 : 0.12, transition: "opacity .8s" }}>
          <line
            x1={sunPos.x}
            y1={sunPos.y + 18}
            x2={240}
            y2={388}
            stroke="#FFC400"
            strokeWidth={beamOn ? flowWidth(pv ?? 0) : 1}
            strokeDasharray="3 9"
            className={beamOn ? "flow-anim" : ""}
            style={beamOn ? { ["--dur" as string]: `${flowDur(pv ?? 0)}s` } : undefined}
          />
        </g>
      )}

      {/* ---- СОЛНЕЧНЫЕ ПАНЕЛИ ---- */}
      <g>
        <polygon points="150,392 330,392 312,352 168,352" fill="url(#panelGrad)" stroke={beamOn ? "#FFC40088" : "#27404F"} strokeWidth="1.5" />
        {[1, 2, 3].map((i) => (
          <line key={`v${i}`} x1={168 + i * 36} y1={352 + i * 1.5} x2={150 + i * 45} y2={392} stroke="#163450" strokeWidth="1" />
        ))}
        {[1, 2].map((i) => (
          <line key={`h${i}`} x1={159 + i * 4.5} y1={352 + i * 13.3} x2={321 - i * 4.5} y2={352 + i * 13.3} stroke="#163450" strokeWidth="1" />
        ))}
        <rect x="233" y="392" width="14" height="26" fill="#101B25" stroke="#27404F" />
        <text x="240" y="440" textAnchor="middle" fontSize={12} fill="#F1F4F6" className="svg-label" fontWeight={600}>СОЛНЕЧНЫЕ ПАНЕЛИ</text>
        <text x="240" y="458" textAnchor="middle" fontSize={15} fill={beamOn ? "#FFC400" : "#8A969F"} className="svg-num" fontWeight={700}>
          {pv === null ? "—" : `${fmt(pv, 0)} W`}
        </text>
        <text x="240" y="474" textAnchor="middle" fontSize={10.5} fill="#8A969F" className="svg-num">
          {fmt(data?.pvVoltage, 1)} V · {fmt(data?.pvCurrent, 2)} A
        </text>
      </g>

      {/* ---- АККУМУЛЯТОР ---- */}
      <g>
        <rect x="416" y="336" width="108" height="10" rx="3" fill="#27404F" />
        <rect x="400" y="346" width="140" height="118" rx="6" fill="#101B25" stroke={charging ? "#70D90077" : "#27404F"} strokeWidth="1.5" />
        <clipPath id="battClip">
          <rect x="404" y="350" width="132" height="110" rx="4" />
        </clipPath>
        <g clipPath="url(#battClip)">
          <rect
            x="404"
            width="132"
            y={350 + 110 - (110 * battFill) / 100}
            height={(110 * battFill) / 100}
            fill={battColor}
            opacity={socPct === null ? 0 : 0.5}
            style={{ transition: "y .8s ease, height .8s ease, fill .5s" }}
          />
          {charging && (
            <rect x="404" y="350" width="132" height="30" fill="rgba(255,255,255,0.28)" className="charge-sheen" />
          )}
        </g>
        <text x="470" y="398" textAnchor="middle" fontSize={24} fill="#F1F4F6" className="svg-num" fontWeight={700}>
          {socPct === null ? "—" : `${fmt(socPct, 0)}%`}
        </text>
        <text x="470" y="420" textAnchor="middle" fontSize={12} fill="#8A969F" className="svg-num">
          {fmt(data?.batteryVoltage ?? data?.bmsVoltage, 2)} V · {fmt(data?.batteryCurrent ?? data?.bmsCurrent, 2)} A
        </text>
        <text x="470" y="486" textAnchor="middle" fontSize={12} fill="#F1F4F6" className="svg-label" fontWeight={600}>АККУМУЛЯТОР</text>
        <text x="470" y="502" textAnchor="middle" fontSize={11} fill={charging ? "#70D900" : (batt ?? 0) < 0 ? "#FF3D32" : "#8A969F"} className="svg-num">
          {batt === null ? "—" : `${batt > 0 ? "+" : ""}${fmt(batt, 0)} W ${charging ? "· заряд" : batt < 0 ? "· разряд" : ""}`}
        </text>
      </g>

      {/* ---- НАГРУЗКА ---- */}
      <g>
        <rect x="660" y="368" width="170" height="86" rx="6" fill="#101B25" stroke={flowBL !== null || direct !== null ? "#FF3D3266" : "#27404F"} strokeWidth="1.5" />
        <circle cx="690" cy="411" r="13" fill="none" stroke={(load ?? 0) > 0 ? "#FF3D32" : "#27404F"} strokeWidth="2" />
        <circle cx="690" cy="411" r="4" fill={(load ?? 0) > 0 ? "#FF3D32" : "#27404F"} />
        <text x="762" y="405" textAnchor="middle" fontSize={17} fill={(load ?? 0) > 0 ? "#FF3D32" : "#8A969F"} className="svg-num" fontWeight={700}>
          {load === null ? "—" : `${fmt(load, 0)} W`}
        </text>
        <text x="762" y="424" textAnchor="middle" fontSize={9.5} fill="#8A969F" className="svg-label">РАСЧЕТНАЯ · PV − BMS</text>
        <text x="745" y="478" textAnchor="middle" fontSize={12} fill="#F1F4F6" className="svg-label" fontWeight={600}>НАГРУЗКА</text>
      </g>

      {/* ---- потоки ---- */}
      {/* панели → АКБ (заряд) */}
      <Flow x1={332} y1={400} x2={398} y2={400} watts={flowPB} color="#70D900" />
      <FlowLabel x={365} y={388} watts={flowPB} color="#70D900" text="заряд" />
      {/* АКБ → нагрузка (разряд) */}
      <Flow x1={542} y1={410} x2={658} y2={410} watts={flowBL} color="#FF3D32" />
      <FlowLabel x={600} y={432} watts={flowBL} color="#FF3D32" text="разряд" />
      {/* панели → нагрузка (напрямую) */}
      <Flow x1={300} y1={352} x2={700} y2={368} watts={direct} color="#FFC400" curve={70} />
      <FlowLabel x={500} y={300} watts={direct} color="#FFC400" text="PV → нагрузка" />

      {/* статус BMS на сцене */}
      <text x="20" y="528" fontSize={10} fill="#8A969F" className="svg-label">
        BMS: {bmsState === "ONLINE" ? "В СЕТИ" : bmsState === "OFFLINE" ? "НЕТ СВЯЗИ" : bmsState === "STALE" ? "ДАННЫЕ УСТАРЕЛИ" : "НЕТ ДАННЫХ"}
        {"  ·  "}
        Темп. АКБ: {fmt(data?.batteryTemp, 1)} °C
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
          : "Событие",
      sun.untilSunsetMs !== null
        ? hm(sun.untilSunsetMs / 3_600_000)
        : sun.untilSunriseMs !== null
          ? hm(sun.untilSunriseMs / 3_600_000)
          : sun.polarNight
            ? "Полярная ночь"
            : sun.polarDay
              ? "Полярный день"
              : "—",
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
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 py-[5px] border-b border-line/60 last:border-0">
          <span className="text-[11px] text-mut">{k}</span>
          <span className="num text-[12.5px] text-ink">{v}</span>
        </div>
      ))}
      <div className="text-[9.5px] text-mut/70 mt-2 leading-relaxed">
        Расчетное значение: координаты {ruNum(settings.lat ?? 0, 4)}°, {ruNum(settings.lon ?? 0, 4)}° · часовой пояс браузера
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
