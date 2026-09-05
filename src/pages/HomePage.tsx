import { Activity, BatteryCharging, CloudOff, Plug, Server, Sun, Thermometer } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Metric, EmptyState, OnOffChip, SubsystemChip, KV } from "../components/ui";
import { EnergyFlow } from "../components/EnergyFlow";
import { BatteryVisual } from "../components/BatteryVisual";
import { apiOriginLabel } from "../services/api";
import { age, boolChip, fmt, num, str, toBool } from "../utils/format";

function OfflineBanner() {
  const { conn, data } = useData();
  if (conn === "ONLINE" || conn === "STALE" || data !== null) return null;
  const offline = conn === "OFFLINE";
  return (
    <div className="reveal mb-3 rounded-lg border px-4 py-4 flex items-center gap-3.5"
      style={{
        borderColor: offline ? "#FF3D3255" : "#FFC40044",
        backgroundColor: offline ? "#FF3D320D" : "#FFC4000A",
      }}
    >
      <span
        className="w-9 h-9 rounded flex items-center justify-center shrink-0"
        style={{ backgroundColor: offline ? "#FF3D321F" : "#FFC4001A", color: offline ? "#FF3D32" : "#FFC400" }}
      >
        <Server size={17} />
      </span>
      <div className="min-w-0">
        <div className="font-display font-semibold text-[14px] tracking-wide" style={{ color: offline ? "#FF3D32" : "#FFC400" }}>
          {offline ? "GATEWAY OFFLINE" : conn === "RECONNECTING" ? "ВОССТАНОВЛЕНИЕ СОЕДИНЕНИЯ" : "ПОДКЛЮЧЕНИЕ К GATEWAY"}
        </div>
        <div className="text-[11.5px] text-mut mt-0.5">
          {offline
            ? "ESP32 Gateway недоступен. Идёт периодический опрос HTTP API и переподключение WebSocket (порт 81)."
            : "Ожидание ответа от ESP32 Gateway. Значения появятся после первого реального ответа."}
          <span className="num ml-1.5 text-mut/80">{apiOriginLabel()}</span>
        </div>
      </div>
    </div>
  );
}

function FaultBlock() {
  const { data } = useData();
  const fault = toBool(data?.fault);
  if (fault === true) {
    return (
      <div className="rounded border px-3 py-2.5 mb-2.5" style={{ borderColor: "#FF3D3266", backgroundColor: "#FF3D3212" }}>
        <div className="flex items-center gap-2">
          <span className="w-[8px] h-[8px] rounded-full led" style={{ backgroundColor: "#FF3D32", color: "#FF3D32" }} />
          <span className="font-display font-bold text-[14px] tracking-[0.14em] text-bad">FAULT</span>
          <span className="num text-[11px] text-bad/90 ml-auto">code {fmt(data?.faultCode, 0)}</span>
        </div>
        <div className="text-[11.5px] text-ink/90 mt-1">
          {str(data?.faultDescription) !== "—" ? str(data?.faultDescription) : "Unknown protection / fault"}
        </div>
      </div>
    );
  }
  if (fault === false) {
    return (
      <div className="rounded border px-3 py-2.5 mb-2.5" style={{ borderColor: "#70D90044", backgroundColor: "#70D9000D" }}>
        <div className="flex items-center gap-2">
          <span className="w-[8px] h-[8px] rounded-full led" style={{ backgroundColor: "#70D900", color: "#70D900" }} />
          <span className="font-display font-bold text-[14px] tracking-[0.14em] text-ok">NORMAL</span>
        </div>
        <div className="text-[11px] text-mut mt-1">Активных неисправностей контроллера нет</div>
      </div>
    );
  }
  return (
    <div className="rounded border border-line px-3 py-2.5 mb-2.5">
      <span className="font-display font-bold text-[13px] tracking-[0.14em] text-mut">—</span>
      <div className="text-[11px] text-mut mt-1">Статус неисправности не получен</div>
    </div>
  );
}

export function HomePage() {
  const { data, status, bmsState, controllerState } = useData();
  const charging = (num(data?.chargePower) ?? 0) > 0;

  return (
    <div>
      <OfflineBanner />

      <div className="grid xl:grid-cols-3 gap-3">
        {/* ENERGY FLOW */}
        <Card
          title="Energy Flow"
          icon={<Activity size={13} />}
          className="xl:col-span-2"
          right={
            <span className="num text-[10px] text-mut">
              PV {fmt(data?.pvPower, 0)} W · LOAD {fmt(data?.loadPower, 0)} W
            </span>
          }
          delay={0}
        >
          <EnergyFlow />
        </Card>

        {/* SYSTEM STATUS + SUN */}
        <div className="space-y-3">
          <Card title="System Status" icon={<Server size={13} />} delay={60}>
            <FaultBlock />
            <KV k="Charge state">{str(data?.chargeState)}</KV>
            <KV k="Controller (Modbus)">
              <SubsystemChip state={controllerState} />
            </KV>
            <KV k="BMS (JBD)">
              <SubsystemChip state={bmsState} />
            </KV>
            <KV k="BMS data age">{age(data?.bmsDataAgeMs ?? status?.bms_data_age_ms)}</KV>
            <KV k="Modbus errors">{fmt(status?.modbus_errors, 0)}</KV>
            <KV k="Controller temp">{fmt(data?.controllerTemp, 1)} °C</KV>
          </Card>

          <Card title="Sun Position" icon={<Sun size={13} />} delay={120}>
            <EmptyState icon={CloudOff} title="Data unavailable" hint="Backend не предоставляет данные солнца и погоды" compact />
          </Card>
        </div>
      </div>

      {/* нижний ряд: батарея / PV / нагрузка */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
        <Card title="Battery" icon={<BatteryCharging size={13} />} delay={40}>
          <div className="flex gap-4">
            <BatteryVisual soc={data?.batterySOC} charging={charging} height={138} />
            <div className="flex-1 space-y-2.5 min-w-0">
              <Metric label="Battery Voltage" value={data?.batteryVoltage} digits={2} unitStr="V" source="/api/data · batteryVoltage" />
              <Metric label="Battery Current" value={data?.batteryCurrent} digits={2} unitStr="A" sign source="/api/data · batteryCurrent" />
              <Metric label="Battery Power" value={data?.bmsPower} digits={1} unitStr="W" sign source="/api/data · bmsPower" />
              <div className="flex items-center gap-1.5 text-[11px] text-mut">
                <Thermometer size={12} />
                <span className="num">{fmt(data?.batteryTemp, 1)} °C</span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="PV · Solar" icon={<Sun size={13} />} delay={90}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Metric label="PV Power" value={data?.pvPower} digits={1} unitStr="W" size="lg" tone="warn" source="/api/data · pvPower" className="col-span-2" />
            <Metric label="PV Voltage" value={data?.pvVoltage} digits={1} unitStr="V" source="/api/data · pvVoltage" />
            <Metric label="PV Current" value={data?.pvCurrent} digits={2} unitStr="A" source="/api/data · pvCurrent" />
            <Metric label="Charge Power" value={data?.chargePower} digits={1} unitStr="W" tone="ok" source="/api/data · chargePower" />
            <Metric label="Charge State" text={str(data?.chargeState)} source="/api/data · chargeState" />
          </div>
        </Card>

        <Card
          title="Нагрузка"
          icon={<Plug size={13} />}
          delay={140}
          right={<OnOffChip value={boolChip(data?.loadState)} />}
          className="md:col-span-2 xl:col-span-1"
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Metric label="Load Power" value={data?.loadPower} digits={1} unitStr="W" size="lg" tone="bad" source="/api/data · loadPower" className="col-span-2" />
            <Metric label="Load Voltage" value={data?.loadVoltage} digits={1} unitStr="V" source="/api/data · loadVoltage" />
            <Metric label="Load Current" value={data?.loadCurrent} digits={2} unitStr="A" source="/api/data · loadCurrent" />
            <Metric label="Max Load Current" value={data?.maxLoadCurrent} digits={1} unitStr="A" source="/api/data · maxLoadCurrent" />
            <Metric label="Max Load Power" value={data?.maxLoadPower} digits={0} unitStr="W" source="/api/data · maxLoadPower" />
          </div>
        </Card>
      </div>
    </div>
  );
}
