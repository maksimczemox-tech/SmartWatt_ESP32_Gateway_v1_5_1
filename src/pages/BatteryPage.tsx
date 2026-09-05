import { ArrowDownToLine, ArrowUpFromLine, BatteryCharging, Gauge } from "lucide-react";
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
      <Card title="Батарея · Телеметрия" icon={<BatteryCharging size={13} />} delay={0}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Metric label="SOC" value={data?.batterySOC} digits={1} unitStr="%" size="lg" tone="ok" source="/api/data · batterySOC" />
          <Metric label="Battery Voltage" value={data?.batteryVoltage} digits={2} unitStr="V" size="lg" source="/api/data · batteryVoltage" />
          <Metric label="Battery Current" value={data?.batteryCurrent} digits={2} unitStr="A" sign source="/api/data · batteryCurrent" />
          <Metric label="Battery Power" value={data?.bmsPower} digits={1} unitStr="W" sign source="/api/data · bmsPower" />
          <Metric label="Battery Temp" value={data?.batteryTemp} digits={1} unitStr="°C" source="/api/data · batteryTemp" />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        {/* визуальный SOC */}
        <Card
          title="SOC · State of Charge"
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
            <KV k="Charge state">{str(data?.chargeState)}</KV>
            <KV k="Charge power">{fmt(data?.chargePower, 1)} W</KV>
          </div>
        </Card>

        {/* MIN */}
        <Card title="Min Battery Voltage" icon={<ArrowDownToLine size={13} />} delay={100}>
          <Metric
            label="Минимальное напряжение"
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
            <KV k="Battery temp">{fmt(data?.batteryTemp, 1)} °C</KV>
          </div>
        </Card>

        {/* MAX */}
        <Card title="Max Battery Voltage" icon={<ArrowUpFromLine size={13} />} delay={150}>
          <Metric
            label="Максимальное напряжение"
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
            <KV k="Full charges">{fmt(data?.fullCharges, 0)}</KV>
          </div>
        </Card>
      </div>

      {/* лимиты зарядки */}
      <Card title="Лимиты зарядки" icon={<Gauge size={13} />} delay={200} className="mt-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="Max Charge Current" value={data?.maxChargeCurrent} digits={1} unitStr="A" source="/api/data · maxChargeCurrent" />
          <Metric label="Max Charge Power" value={data?.maxChargePower} digits={0} unitStr="W" source="/api/data · maxChargePower" />
          <Metric label="Max Load Current" value={data?.maxLoadCurrent} digits={1} unitStr="A" source="/api/data · maxLoadCurrent" />
          <Metric label="Max Load Power" value={data?.maxLoadPower} digits={0} unitStr="W" source="/api/data · maxLoadPower" />
        </div>
      </Card>
    </div>
  );
}
