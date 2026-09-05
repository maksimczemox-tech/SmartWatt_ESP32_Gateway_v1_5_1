import { useState } from "react";
import { Info, Sun, Zap } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Metric, KV } from "../components/ui";
import { SamplesChart, WindowSwitch, type SeriesDef } from "../components/charts";
import { SunPanel } from "../components/EnergyScene";
import { chargeStateRu, fmt, fmtTime, str } from "../utils/format";

const S_PV: SeriesDef = { key: "pv", name: "Мощность PV", color: "#FFC400", unit: "W" };

export function SolarPage() {
  const { data, samples, sessionStart, controllerState } = useData();
  const [windowH, setWindowH] = useState<number | null>(6);

  return (
    <div>
      <Card title="Солнце · PV телеметрия" icon={<Sun size={13} />} delay={0}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric
            label="Мощность PV"
            value={data?.pvPower}
            digits={1}
            unitStr="W"
            size="lg"
            tone="warn"
            source="/api/data · pvPower"
            sub={
              <span className="inline-flex items-center gap-1">
                <Info size={10} className="text-mut/70" />
                Мощность PV = напряжение × ток (из телеметрии)
              </span>
            }
          />
          <Metric label="Напряжение PV" value={data?.pvVoltage} digits={2} unitStr="V" size="lg" source="/api/data · pvVoltage" />
          <Metric label="Ток PV" value={data?.pvCurrent} digits={2} unitStr="A" size="lg" source="/api/data · pvCurrent" />
          <Metric label="Мощность заряда" value={data?.chargePower} digits={1} unitStr="W" size="lg" tone="ok" source="/api/data · chargePower" />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <Card
          title="Производство PV"
          icon={<Sun size={13} />}
          className="lg:col-span-2"
          delay={60}
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
          <SamplesChart samples={samples} series={[S_PV]} windowHours={windowH} sessionStart={sessionStart} height={235} />
          <p className="text-[10px] text-mut/70 mt-2">
            Реальные samples с момента запуска интерфейса ({fmtTime(sessionStart)}). Суммарная энергия — в разделе «Статистика»
            (счётчики прошивки totalChargeWh / totalLoadWh).
          </p>
        </Card>

        <div className="space-y-3">
          <SunPanel />

          <Card title="Лимиты заряда" icon={<Zap size={13} />} delay={110}>
            <Metric label="Максимальный ток заряда" value={data?.maxChargeCurrent} digits={1} unitStr="A" source="/api/data · maxChargeCurrent" />
            <div className="h-3" />
            <Metric label="Максимальная мощность заряда" value={data?.maxChargePower} digits={0} unitStr="W" source="/api/data · maxChargePower" />
          </Card>

          <Card title="Состояние контроллера" icon={<Zap size={13} />} delay={160}>
            <KV k="Modbus-контроллер">
              {controllerState === "ONLINE"
                ? "АКТУАЛЕН"
                : controllerState === "OFFLINE"
                  ? "НЕТ СВЯЗИ"
                  : controllerState === "STALE"
                    ? "ДАННЫЕ УСТАРЕЛИ"
                    : "НЕТ ДАННЫХ"}
            </KV>
            <KV k="Режим заряда">{chargeStateRu(data?.chargeState)}</KV>
            <KV k="Температура контроллера">{fmt(data?.controllerTemp, 1)} °C</KV>
            <KV k="Неисправность">{str(data?.faultDescription)}</KV>
          </Card>
        </div>
      </div>
    </div>
  );
}
