import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BatteryCharging,
  Gauge,
  Plug,
  Server,
  Sun,
  TimerReset,
} from "lucide-react";
import { useData, STALE_MS } from "../store/DataContext";
import { Card, Metric, EmptyState, OnOffChip, SourceTag } from "../components/ui";
import { EnergyScene, SunPanel, SysTile } from "../components/EnergyScene";
import { SamplesChart, WindowSwitch, type SeriesDef } from "../components/charts";
import { useSettings } from "../hooks/useSettings";
import { useNow } from "../hooks/useNow";
import {
  autonomy,
  chargeForecast,
  estimatedLoadPower,
  type ForecastMode,
} from "../utils/energy";
import { apiOriginLabel } from "../services/api";
import { boolChip, chargeStateRu, fmt, fmtTime, hm, kwh, num, str, toBool } from "../utils/format";

const S_PV: SeriesDef = { key: "pv", name: "PV", color: "#FFC400", unit: "W" };
const S_BATT: SeriesDef = { key: "batt", name: "АКБ", color: "#2F9BE8", unit: "W" };
const S_LOAD: SeriesDef = { key: "load", name: "Нагрузка (расчет)", color: "#FF3D32", unit: "W" };

/* ---------------- KPI-карточка ---------------- */

function Kpi({
  label,
  value,
  unitStr,
  tone = "default",
  icon,
  children,
  delay = 0,
  calc = false,
}: {
  label: string;
  value: string;
  unitStr?: string;
  tone?: "ok" | "warn" | "bad" | "acc" | "default";
  icon: ReactNode;
  children?: ReactNode;
  delay?: number;
  calc?: boolean;
}) {
  const toneCls =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : tone === "acc" ? "text-acc2" : "text-ink";
  return (
    <div
      className="reveal relative rounded-lg border border-line bg-panel p-3.5 overflow-hidden card-hover"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${
          tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-acc"
        } opacity-70`}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9.5px] tracking-[0.16em] uppercase text-mut">{label}</span>
        <span className="text-mut/80 [&>svg]:block">{icon}</span>
      </div>
      <div className={`num font-semibold text-[26px] leading-8 mt-1.5 ${toneCls}`}>
        {value}
        {value !== "—" && unitStr && <span className="text-[12px] text-mut ml-1">{unitStr}</span>}
      </div>
      {children && <div className="mt-1.5 text-[10.5px] text-mut leading-relaxed">{children}</div>}
      {calc && (
        <span className="absolute right-2 top-2 text-[8px] tracking-[0.14em] uppercase text-mut/70 border border-line rounded-sm px-1 py-px">
          расчет
        </span>
      )}
    </div>
  );
}

/* ---------------- баннер состояния связи ---------------- */

function ConnBanner() {
  const { conn, data, receivedAt } = useData();
  if (conn === "ONLINE" || conn === "STALE") return null;
  if (conn === "OFFLINE" && data === null) {
    return (
      <div className="reveal mb-3 rounded-lg border px-4 py-3.5 flex items-center gap-3"
        style={{ borderColor: "#FF3D3255", backgroundColor: "#FF3D320D" }}
      >
        <Server size={17} className="text-bad shrink-0" />
        <div>
          <div className="font-display font-semibold text-[13.5px] tracking-wide text-bad">НЕТ СВЯЗИ С GATEWAY</div>
          <div className="text-[11.5px] text-mut mt-0.5">
            ESP32 недоступен. Идёт опрос HTTP API и переподключение WebSocket (порт 81).
            <span className="num ml-1.5 text-mut/80">{apiOriginLabel()}</span>
          </div>
        </div>
      </div>
    );
  }
  if (conn === "OFFLINE" || conn === "RECONNECTING") {
    return (
      <div className="reveal mb-3 rounded-lg border px-4 py-3 flex items-center gap-3"
        style={{ borderColor: "#FFC40044", backgroundColor: "#FFC4000A" }}
      >
        <Activity size={16} className="text-warn shrink-0 blink-soft" />
        <div className="text-[11.5px] text-mut">
          <span className="font-display font-semibold text-[12.5px] tracking-wide text-warn mr-2">
            {conn === "RECONNECTING" ? "ВОССТАНОВЛЕНИЕ СВЯЗИ" : "СВЯЗЬ ПОТЕРЯНА"}
          </span>
          Показаны последние известные значения — они отмечены как УСТАРЕЛО.
          {receivedAt !== null && <span className="num ml-1.5">Получено: {fmtTime(receivedAt)}</span>}
        </div>
      </div>
    );
  }
  return null;
}

function StaleMark() {
  const { conn } = useData();
  if (conn === "ONLINE") return null;
  return (
    <span className="ml-2 align-middle text-[8.5px] tracking-[0.14em] uppercase text-warn border border-warn/50 bg-warn/10 rounded-sm px-1 py-px">
      УСТАРЕЛО
    </span>
  );
}

/* ---------------- главная ---------------- */

export function HomePage() {
  const { data, status, samples, sessionStart, conn, telemetryState, bmsState, controllerState } = useData();
  const [settings, setSettings] = useSettings();
  const now = useNow(1000);
  void now;

  const [windowH, setWindowH] = useState<number | null>(1);

  const pv = num(data?.pvPower);
  const batt = num(data?.bmsPower);
  const load = estimatedLoadPower(pv, batt);
  const soc = num(data?.batterySOC ?? data?.bmsSOC);
  const charging = (batt ?? 0) > 0;

  const bmsAge = num(data?.bmsDataAgeMs ?? status?.bms_data_age_ms);
  const bmsStale = bmsAge !== null && bmsAge > STALE_MS;

  const forecast = useMemo(
    () =>
      chargeForecast({
        soc,
        remainingAh: num(data?.bmsRemainingAh),
        fullAh: num(data?.bmsFullCapacityAh),
        voltage: num(data?.batteryVoltage ?? data?.bmsVoltage),
        currentPower: batt,
        samples,
        mode: settings.forecastMode,
        bmsStale,
      }),
    [soc, data?.bmsRemainingAh, data?.bmsFullCapacityAh, data?.batteryVoltage, data?.bmsVoltage, batt, samples, settings.forecastMode, bmsStale],
  );

  const auto = useMemo(
    () =>
      autonomy({
        soc,
        fullAh: num(data?.bmsFullCapacityAh),
        voltage: num(data?.batteryVoltage ?? data?.bmsVoltage),
        loadW: load,
        minSoc: settings.minSoc,
      }),
    [soc, data?.bmsFullCapacityAh, data?.batteryVoltage, data?.bmsVoltage, load, settings.minSoc],
  );

  const fault = toBool(data?.fault);

  return (
    <div>
      <ConnBanner />

      {/* ЦЕНТРАЛЬНАЯ СЦЕНА */}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-3">
        <Card
          title="Энергетическая система"
          icon={<Sun size={13} />}
          delay={0}
          bodyClassName="p-2"
          right={
            <span className="num text-[10px] text-mut hidden sm:inline">
              PV {fmt(pv, 0)} W · АКБ {batt === null ? "—" : `${batt > 0 ? "+" : ""}${fmt(batt, 0)}`} W · Нагрузка {fmt(load, 0)} W
            </span>
          }
        >
          <EnergyScene />
        </Card>
        <SunPanel />
      </div>

      {/* КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-3">
        <Kpi label="Солнечная генерация" value={fmt(pv, 0)} unitStr="W" tone="warn" icon={<Sun size={14} />} delay={20}>
          {fmt(data?.pvVoltage, 2)} V · {fmt(data?.pvCurrent, 2)} A
          <div>Режим: {chargeStateRu(data?.chargeState)}</div>
        </Kpi>

        <Kpi
          label={charging ? "Заряд аккумулятора" : "Аккумулятор"}
          value={batt === null ? "—" : `${batt > 0 ? "+" : ""}${fmt(batt, 0)}`}
          unitStr="W"
          tone={charging ? "ok" : (batt ?? 0) < 0 ? "bad" : "default"}
          icon={<BatteryCharging size={14} />}
          delay={40}
        >
          {batt === null
            ? "Нет данных BMS"
            : charging
              ? "Аккумулятор заряжается"
              : batt < 0
                ? "Аккумулятор разряжается"
                : "НЕТ ЗАРЯДА"}
          <StaleMark />
        </Kpi>

        <Kpi label="Расчетная нагрузка" value={fmt(load, 0)} unitStr="W" tone="bad" icon={<Plug size={14} />} delay={60} calc>
          Источник: PV − BMS
          <div>max(0, {fmt(pv, 0)} − {batt === null ? "—" : fmt(batt, 0)})</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span>Выход LOAD:</span>
            <OnOffChip value={boolChip(data?.loadState)} />
          </div>
        </Kpi>

        <Kpi label="Автономность" value={auto.kind === "ok" ? hm(auto.hours) : "—"} tone="acc" icon={<Gauge size={14} />} delay={80} calc>
          {auto.kind === "ok" && (
            <>
              Доступно: {fmt(auto.usableWh, 0)} Wh · мин. SOC {auto.minSoc}%
            </>
          )}
          {auto.kind === "no-load" && "Нагрузка отсутствует"}
          {auto.kind === "below-min" && `Заряд ниже порога ${auto.minSoc}%`}
          {auto.kind === "insufficient" && "Недостаточно данных для расчета"}
          <StaleMark />
        </Kpi>

        <Kpi label="До полной зарядки" value={forecast.kind === "ok" ? hm(forecast.hours) : "—"} tone="ok" icon={<TimerReset size={14} />} delay={100} calc>
          {forecast.kind === "ok" && (
            <>
              Осталось: {fmt(forecast.remainingAh, 1)} Ah · {fmt(forecast.remainingWh, 0)} Wh
              <div>Мощность: {fmt(forecast.powerUsed, 0)} W ({forecast.mode === "average" ? "средняя" : "текущая"})</div>
              {forecast.note && <div className="text-warn">{forecast.note}</div>}
            </>
          )}
          {forecast.kind === "not-charging" && "Заряд не выполняется"}
          {forecast.kind === "full" && "Аккумулятор полностью заряжен"}
          {forecast.kind === "stale" && "Данные BMS устарели"}
          {forecast.kind === "insufficient" && "Недостаточно данных для прогноза"}
          {forecast.kind === "ok" && (
            <div className="flex gap-1 mt-1">
              {(
                [
                  ["current", "Текущая"],
                  ["average", "Средняя"],
                ] as [ForecastMode, string][]
              ).map(([m, l]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSettings({ forecastMode: m })}
                  className={`px-1.5 py-px rounded-sm border text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                    settings.forecastMode === m
                      ? "border-acc/60 bg-acc/15 text-acc2"
                      : "border-line text-mut hover:text-ink"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </Kpi>
      </div>

      {/* ПОТОК ЭНЕРГИИ */}
      <Card
        title="Поток энергии"
        icon={<Activity size={13} />}
        delay={120}
        className="mt-3"
        right={
          <div className="flex items-center gap-2">
            <span className="num text-[9.5px] text-mut hidden sm:inline">образцов: {samples.length}</span>
            <WindowSwitch
              value={windowH}
              onChange={setWindowH}
              options={[
                { label: "1 ч", hours: 1 },
                { label: "6 ч", hours: 6 },
                { label: "24 ч", hours: 24 },
                { label: "7 дней", hours: 24 * 7 },
              ]}
            />
          </div>
        }
      >
        <SamplesChart samples={samples} series={[S_PV, S_BATT, S_LOAD]} windowHours={windowH} sessionStart={sessionStart} height={225} />
        <p className="text-[10px] text-mut/70 mt-2 leading-relaxed">
          Только реально полученные фреймы (WebSocket / опрос). История доступна с момента запуска интерфейса ({fmtTime(sessionStart)}).
          Нагрузка — расчетная: max(0, PV − BMS).
        </p>
      </Card>

      {/* ОТЧЁТ + СТАТУС */}
      <div className="grid lg:grid-cols-2 gap-3 mt-3">
        <Card title="Отчет производства энергии" icon={<Sun size={13} />} delay={140}>
          <div className="grid grid-cols-2 gap-x-6">
            <Metric label="Заряд за день" value={data?.dailyChargeAh} digits={1} unitStr="Ah" source="/api/data · dailyChargeAh"
              sub={<span>Энергия, переданная в аккумулятор</span>} />
            <Metric label="Нагрузка за день" value={data?.dailyLoadAh} digits={1} unitStr="Ah" source="/api/data · dailyLoadAh" />
            <Metric label="Всего в аккумулятор" value={data?.totalChargeWh} digits={0} unitStr="Wh" source="/api/data · totalChargeWh"
              sub={<span className="num">{kwh(data?.totalChargeWh)}</span>} />
            <Metric label="Всего на нагрузку" value={data?.totalLoadWh} digits={0} unitStr="Wh" source="/api/data · totalLoadWh"
              sub={<span className="num">{kwh(data?.totalLoadWh)}</span>} />
          </div>
          <div className="mt-3 pt-2.5 border-t border-line/60">
            {(
              [
                ["Сегодня", num(data?.dailyChargeWh)],
                ["Вчера", null],
                ["7 дней", null],
                ["30 дней", null],
              ] as [string, number | null][]
            ).map(([label, v]) => (
              <div key={label} className="flex items-baseline justify-between py-[4px] border-b border-line/40 last:border-0">
                <span className="text-[11px] text-mut">{label}</span>
                <span className="num text-[12px] text-ink">
                  {v === null ? (label === "Сегодня" ? "Недостаточно данных" : "Недостаточно данных для отчета") : kwh(v)}
                </span>
              </div>
            ))}
            <p className="text-[9.5px] text-mut/70 mt-2 leading-relaxed">
              Солнечная генерация и заряд аккумулятора — разные величины: здесь энергия, переданная в аккумулятор (счетчики прошивки).
            </p>
          </div>
        </Card>

        <Card title="Статус системы" icon={<Server size={13} />} delay={160}>
          <div className="grid grid-cols-2 gap-2">
            <SysTile label="Gateway" state={conn === "ONLINE" ? "ONLINE" : conn === "STALE" ? "STALE" : conn === "OFFLINE" ? "OFFLINE" : "NO_DATA"} />
            <SysTile label="Телеметрия" state={telemetryState} />
            <SysTile label="BMS (JBD)" state={bmsState} />
            <SysTile label="Modbus" state={controllerState} />
          </div>

          {fault === true && (
            <div className="rounded border px-3 py-2.5 mt-3" style={{ borderColor: "#FF3D3266", backgroundColor: "#FF3D3212" }}>
              <div className="flex items-center gap-2">
                <span className="w-[8px] h-[8px] rounded-full led" style={{ backgroundColor: "#FF3D32", color: "#FF3D32" }} />
                <span className="font-display font-bold text-[13px] tracking-[0.14em] text-bad">АВАРИЯ</span>
                <span className="num text-[11px] text-bad/90 ml-auto">код {fmt(data?.faultCode, 0)}</span>
              </div>
              <div className="text-[11.5px] text-ink/90 mt-1">
                {str(data?.faultDescription) !== "—" ? str(data?.faultDescription) : "Неизвестная защита / неисправность"}
              </div>
            </div>
          )}
          {fault === false && (
            <div className="rounded border px-3 py-2.5 mt-3" style={{ borderColor: "#70D90044", backgroundColor: "#70D9000D" }}>
              <div className="flex items-center gap-2">
                <span className="w-[8px] h-[8px] rounded-full led" style={{ backgroundColor: "#70D900", color: "#70D900" }} />
                <span className="font-display font-bold text-[13px] tracking-[0.14em] text-ok">НОРМА</span>
              </div>
              <div className="text-[11px] text-mut mt-1">Активных неисправностей контроллера нет</div>
            </div>
          )}
          {fault === null && (
            <div className="rounded border border-line px-3 py-2.5 mt-3">
              <span className="font-display font-bold text-[12.5px] tracking-[0.14em] text-mut">—</span>
              <div className="text-[11px] text-mut mt-1">Статус неисправности не получен</div>
            </div>
          )}

          <div className="mt-3 pt-2.5 border-t border-line/60 text-[10.5px] text-mut space-y-[3px]">
            <div className="flex justify-between"><span>Температура контроллера</span><span className="num text-ink">{fmt(data?.controllerTemp, 1)} °C</span></div>
            <div className="flex justify-between"><span>Последняя ошибка Modbus</span><span className="num text-ink">{str(status?.last_modbus_error)}</span></div>
          </div>
        </Card>
      </div>

      {/* источники для инженерного режима */}
      <div className="mt-3">
        <SourceHints />
      </div>
    </div>
  );
}

function SourceHints() {
  const { showSources, data } = useData();
  if (!showSources) return null;
  return (
    <Card title="Источники параметров (инженерная информация)" icon={<Activity size={13} />}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
        <div><Metric label="Мощность PV" value={data?.pvPower} digits={1} unitStr="W" source="/api/data · pvPower (измерено)" /></div>
        <div><Metric label="Мощность BMS" value={data?.bmsPower} digits={1} unitStr="W" sign source="/api/data · bmsPower (измерено)" /></div>
        <div>
          <Metric label="Расчетная нагрузка" value={estimatedLoadPower(num(data?.pvPower), num(data?.bmsPower))} digits={1} unitStr="W" source="расчет · max(0, pvPower − bmsPower)" />
          <SourceTag source="формула: max(0, PV − BMS)" />
        </div>
      </div>
    </Card>
  );
}
