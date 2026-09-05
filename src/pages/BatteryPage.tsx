import { ArrowDownToLine, ArrowUpFromLine, BatteryCharging, Gauge, RotateCw } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Metric, KV } from "../components/ui";
import { BatteryVisual } from "../components/BatteryVisual";
import { fmt, num, str } from "../utils/format";

export function BatteryPage() {
  const { data } = useData();
  const charging = (num(data?.chargePower) ?? 0) > 0;

  return (
    <div>
      {/* верхний блок телеметрии */}
      <Card title="Батарея · телеметрия" icon={<BatteryCharging size={13} />} delay={0}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Metric label="Заряд батареи (SOC)" value={data?.batterySOC} digits={1} unitStr="%" size="lg" tone="ok" source="/api/data · batterySOC" />
          <Metric label="Напряжение батареи" value={data?.batteryVoltage} digits={2} unitStr="V" size="lg" source="/api/data · batteryVoltage" />
          <Metric label="Ток батареи" value={data?.batteryCurrent} digits={2} unitStr="A" sign source="/api/data · batteryCurrent" />
          <Metric label="Мощность батареи" value={data?.bmsPower} digits={1} unitStr="W" sign source="/api/data · bmsPower" sub={<span>источник: BMS (поле bmsPower)</span>} />
          <Metric label="Температура батареи" value={data?.batteryTemp} digits={1} unitStr="°C" source="/api/data · batteryTemp" />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        {/* визуальный SOC */}
        <Card
          title="Уровень заряда (SOC)"
          icon={<Gauge size={13} />}
          delay={50}
          right={
            <span className={`text-[10px] font-semibold tracking-[0.12em] ${charging ? "text-ok" : "text-mut"}`}>
              {charging ? "ЗАРЯД" : str(data?.chargeState) !== "—" ? str(data?.chargeState) : ""}
            </span>
          }
        >
          <div className="py-2">
            <BatteryVisual soc={data?.batterySOC} charging={charging} height={212} />
          </div>
          <div className="mt-3 border-t border-line/60 pt-2">
            <KV k="Состояние заряда">{str(data?.chargeState)}</KV>
            <KV k="Мощность заряда">{fmt(data?.chargePower, 1)} W</KV>
          </div>
        </Card>

        {/* минимальное напряжение */}
        <Card title="Минимальное напряжение" icon={<ArrowDownToLine size={13} />} delay={100}>
          <Metric
            label="Мин. напряжение батареи"
            value={data?.batteryMinVoltage}
            digits={2}
            unitStr="V"
            size="lg"
            tone="bad"
            source="/api/data · batteryMinVoltage"
          />
          <p className="text-[10.5px] text-mut/80 leading-relaxed mt-3">
            Реальное значение из телеметрии Gateway. При отсутствии данных отображается «—».
          </p>
          <div className="mt-3 border-t border-line/60 pt-2">
            <KV k="Температура батареи">{fmt(data?.batteryTemp, 1)} °C</KV>
          </div>
        </Card>

        {/* максимальное напряжение */}
        <Card title="Максимальное напряжение" icon={<ArrowUpFromLine size={13} />} delay={150}>
          <Metric
            label="Макс. напряжение батареи"
            value={data?.batteryMaxVoltage}
            digits={2}
            unitStr="V"
            size="lg"
            tone="ok"
            source="/api/data · batteryMaxVoltage"
          />
          <p className="text-[10.5px] text-mut/80 leading-relaxed mt-3">
            Реальное значение из телеметрии Gateway. При отсутствии данных отображается «—».
          </p>
          <div className="mt-3 border-t border-line/60 pt-2">
            <KV k="Полные заряды">{fmt(data?.fullCharges, 0)}</KV>
          </div>
        </Card>
      </div>

      {/* ёмкость и циклы — только если реально доступны */}
      <Card title="Ёмкость и циклы (данные BMS)" icon={<RotateCw size={13} />} delay={200} className="mt-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="Оставшаяся ёмкость" value={data?.bmsRemainingAh} digits={1} unitStr="Ah" source="/api/data · bmsRemainingAh" />
          <Metric label="Полная ёмкость" value={data?.bmsFullCapacityAh} digits={1} unitStr="Ah" source="/api/data · bmsFullCapacityAh" />
          <Metric label="Количество циклов" value={data?.bmsCycles} digits={0} source="/api/data · bmsCycles" />
          <Metric label="SOC по данным BMS" value={data?.bmsSOC} digits={0} unitStr="%" source="/api/data · bmsSOC" />
        </div>
        <p className="text-[10.5px] text-mut/70 mt-3">
          Значения поступают от JBD BMS через Gateway. Если BMS не отвечает, отображается «—».
        </p>
      </Card>

      {/* лимиты зарядки */}
      <Card title="Лимиты зарядки и нагрузки" icon={<Gauge size={13} />} delay={250} className="mt-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="Макс. ток заряда" value={data?.maxChargeCurrent} digits={1} unitStr="A" source="/api/data · maxChargeCurrent" />
          <Metric label="Макс. мощность заряда" value={data?.maxChargePower} digits={0} unitStr="W" source="/api/data · maxChargePower" />
          <Metric label="Макс. ток нагрузки" value={data?.maxLoadCurrent} digits={1} unitStr="A" source="/api/data · maxLoadCurrent" />
          <Metric label="Макс. мощность нагрузки" value={data?.maxLoadPower} digits={0} unitStr="W" source="/api/data · maxLoadPower" />
        </div>
      </Card>
    </div>
  );
}
