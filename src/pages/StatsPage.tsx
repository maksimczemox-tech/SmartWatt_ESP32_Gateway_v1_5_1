import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Metric } from "../components/ui";
import { SamplesChart, WindowSwitch, type SeriesDef } from "../components/charts";
import { estimatedLoadPower } from "../utils/energy";
import { fmt, fmtTime, kwh, num } from "../utils/format";

const S_PV: SeriesDef = { key: "pv", name: "PV", color: "#FFC400", unit: "W" };
const S_BATT: SeriesDef = { key: "batt", name: "АКБ", color: "#2F9BE8", unit: "W" };
const S_LOAD: SeriesDef = { key: "load", name: "Нагрузка (расчет)", color: "#FF3D32", unit: "W" };
const S_SOC: SeriesDef = { key: "soc", name: "SOC", color: "#70D900", unit: "%" };

export function StatsPage() {
  const { data, bat, samples, sessionStart } = useData();
  const [windowH, setWindowH] = useState<number | null>(24);

  return (
    <div>
      {/* накопительные счётчики прошивки */}
      <Card title="Статистика · накопленные значения" icon={<BarChart3 size={13} />} delay={0}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Metric label="Заряд за день" value={data?.dailyChargeAh} digits={1} unitStr="Ah" source="/api/data · dailyChargeAh" />
          <Metric label="Нагрузка за день" value={data?.dailyLoadAh} digits={1} unitStr="Ah" source="/api/data · dailyLoadAh" />
          <Metric label="Общий заряд" value={data?.totalChargeAh} digits={1} unitStr="Ah" source="/api/data · totalChargeAh" />
          <Metric label="Общая нагрузка" value={data?.totalLoadAh} digits={1} unitStr="Ah" source="/api/data · totalLoadAh" />
          <Metric label="Дни работы" value={data?.runningDays} digits={0} unitStr="дн" source="/api/data · runningDays" />
          <Metric
            label="Общая энергия заряда"
            value={data?.totalChargeWh}
            digits={0}
            unitStr="Wh"
            source="/api/data · totalChargeWh"
            sub={<span className="num">{kwh(data?.totalChargeWh)}</span>}
          />
          <Metric
            label="Общая энергия нагрузки"
            value={data?.totalLoadWh}
            digits={0}
            unitStr="Wh"
            source="/api/data · totalLoadWh"
            sub={<span className="num">{kwh(data?.totalLoadWh)}</span>}
          />
          <Metric label="Полные заряды" value={data?.fullCharges} digits={0} source="/api/data · fullCharges" />
          <Metric label="Глубокие разряды" value={data?.overDischarges} digits={0} tone="bad" source="/api/data · overDischarges" />
          <Metric
            label="Расчётная нагрузка сейчас"
            value={estimatedLoadPower(num(data?.pvPower), bat.power)}
            digits={0}
            unitStr="W"
            source="расчёт · max(0, PV − АКБ)"
          />
        </div>
      </Card>

      {/* отчёт по энергии (счётчики прошивки; не производство PV) */}
      <Card title="Отчет по энергии" icon={<BarChart3 size={13} />} delay={60} className="mt-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {(
            [
              ["Энергия заряда АКБ · сегодня", num(data?.dailyChargeWh), "Счётчик прошивки dailyChargeWh"],
              ["Вчера", null, null],
              ["7 дней", null, null],
              ["30 дней", null, null],
            ] as [string, number | null, string | null][]
          ).map(([label, v, hint]) => (
            <div key={label} className="rounded border border-line bg-panel2/70 px-3 py-2.5">
              <div className="text-[9.5px] tracking-[0.14em] uppercase text-mut">{label}</div>
              <div className="num font-semibold text-[19px] mt-1">
                {v === null ? <span className="text-[12px] text-mut font-normal">Недостаточно данных для отчета</span> : kwh(v)}
              </div>
              {hint && <div className="text-[9.5px] text-mut/70 mt-0.5">{hint}</div>}
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-mut/70 mt-2.5 leading-relaxed">
          Прошивка v1.6.x предоставляет суточные и суммарные счётчики (Ah/Wh). Прошлые периоды не восстанавливаются —
          при отсутствии счётчика показывается «Недостаточно данных для отчета». Солнечная генерация ≠ заряд аккумулятора:
          здесь показана энергия, переданная в аккумулятор.
        </p>
      </Card>

      {/* графики сессии */}
      <Card
        title="Графики · реальные samples"
        icon={<BarChart3 size={13} />}
        delay={100}
        className="mt-3"
        right={
          <div className="flex items-center gap-2">
            <span className="num text-[9.5px] text-mut hidden sm:inline">
              образцов: {samples.length} · с {fmtTime(sessionStart)}
            </span>
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
        bodyClassName="p-0"
      >
        <div className="grid lg:grid-cols-2 gap-x-3 gap-y-4 p-3.5">
          <div>
            <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">SOC</div>
            <SamplesChart samples={samples} series={[S_SOC]} windowHours={windowH} sessionStart={sessionStart} />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">Производство PV · W</div>
            <SamplesChart samples={samples} series={[S_PV]} windowHours={windowH} sessionStart={sessionStart} />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">Мощность батареи · W (заряд + / разряд −)</div>
            <SamplesChart samples={samples} series={[S_BATT]} windowHours={windowH} sessionStart={sessionStart} />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">Расчетная нагрузка · W</div>
            <SamplesChart samples={samples} series={[S_LOAD]} windowHours={windowH} sessionStart={sessionStart} />
          </div>
        </div>
        <p className="text-[10px] text-mut/70 px-3.5 pb-3 leading-relaxed">
          История формируется из реально полученных фреймов и доступна с момента запуска интерфейса ({fmtTime(sessionStart)}).
          Долговременная история за 7 дней появится только по мере накопления образцов — отсутствующие периоды не заполняются.
        </p>
      </Card>
    </div>
  );
}
