import { Activity, BatteryCharging, CloudOff, Plug, Server, Sun, Thermometer } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Metric, EmptyState, OnOffChip, SubsystemChip, KV } from "../components/ui";
import { EnergyFlow } from "../components/EnergyFlow";
import { BatteryVisual } from "../components/BatteryVisual";
import { apiOriginLabel } from "../services/api";
import { age, boolChip, fmt, fmtTime, num, str, toBool } from "../utils/format";

/**
 * Баннер состояния связи:
 *  - НЕТ СВЯЗИ: данных нет вообще, либо показаны последние значения (пометка УСТАРЕЛО);
 *  - ВОССТАНОВЛЕНИЕ СВЯЗИ / ПОДКЛЮЧЕНИЕ: ожидание реальных данных;
 *  - ДАННЫЕ УСТАРЕЛИ: связь есть, но возраст данных превысил порог.
 */
function StatusBanner() {
  const { conn, data, receivedAt } = useData();
  if (conn === "ONLINE") return null;

  const hasLastData = data !== null;

  if (conn === "STALE") {
    return (
      <BannerShell color="#FFC400" title="ДАННЫЕ УСТАРЕЛИ">
        Связь со шлюзом есть, но телеметрия старше порога актуальности. Показаны последние
        полученные значения{receivedAt !== null ? <> (получены в {fmtTime(receivedAt)})</> : null}.
      </BannerShell>
    );
  }

  if (conn === "OFFLINE") {
    return (
      <BannerShell color="#FF3D32" title="НЕТ СВЯЗИ">
        {hasLastData ? (
          <>
            ESP32 Gateway недоступен. Показаны последние известные значения — они помечены как{" "}
            <span className="text-bad font-semibold">УСТАРЕЛО</span>
            {receivedAt !== null ? <> (получены в {fmtTime(receivedAt)})</> : null}. Идёт опрос HTTP
            API и переподключение WebSocket (порт 81). <span className="num">{apiOriginLabel()}</span>
          </>
        ) : (
          <>
            ESP32 Gateway недоступен, данные не получены. Идёт периодический опрос HTTP API и
            переподключение WebSocket (порт 81). <span className="num">{apiOriginLabel()}</span>
          </>
        )}
      </BannerShell>
    );
  }

  return (
    <BannerShell color="#0878D1" title={conn === "RECONNECTING" ? "ВОССТАНОВЛЕНИЕ СВЯЗИ" : "ПОДКЛЮЧЕНИЕ К ШЛЮЗУ"}>
      Ожидание реальных данных от ESP32 Gateway. Значения появятся после первого ответа устройства —
      до этого отображается «—». <span className="num">{apiOriginLabel()}</span>
    </BannerShell>
  );
}

function BannerShell({
  color,
  title,
  children,
}: {
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="reveal mb-3 rounded-lg border px-4 py-3.5 flex items-start gap-3.5"
      style={{ borderColor: `${color}55`, backgroundColor: `${color}0D` }}
    >
      <span
        className="w-9 h-9 rounded flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: `${color}1F`, color }}
      >
        <Server size={17} />
      </span>
      <div className="min-w-0">
        <div className="font-display font-semibold text-[13.5px] tracking-[0.1em]" style={{ color }}>
          {title}
        </div>
        <div className="text-[11.5px] text-mut mt-1 leading-relaxed">{children}</div>
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
          <span className="font-display font-bold text-[14px] tracking-[0.14em] text-bad">АВАРИЯ</span>
          <span className="num text-[11px] text-bad/90 ml-auto">код {fmt(data?.faultCode, 0)}</span>
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
          <span className="font-display font-bold text-[14px] tracking-[0.14em] text-ok">НОРМА</span>
        </div>
        <div className="text-[11px] text-mut mt-1">Активных неисправностей контроллера нет</div>
      </div>
    );
  }
  return (
    <div className="rounded border border-line px-3 py-2.5 mb-2.5">
      <span className="font-display font-bold text-[13px] tracking-[0.14em] text-mut">—</span>
      <div className="text-[11px] text-mut mt-1">Состояние неисправности не получено</div>
    </div>
  );
}

export function HomePage() {
  const { data, status, bmsState, controllerState } = useData();
  const charging = (num(data?.chargePower) ?? 0) > 0;

  return (
    <div>
      <StatusBanner />

      <div className="grid xl:grid-cols-3 gap-3">
        {/* ПОТОК ЭНЕРГИИ */}
        <Card
          title="Поток энергии"
          icon={<Activity size={13} />}
          className="xl:col-span-2"
          right={
            <span className="num text-[10px] text-mut">
              PV {fmt(data?.pvPower, 0)} W · нагрузка {fmt(data?.loadPower, 0)} W
            </span>
          }
          delay={0}
        >
          <EnergyFlow />
        </Card>

        {/* СИСТЕМНЫЙ СТАТУС + СОЛНЦЕ */}
        <div className="space-y-3">
          <Card title="Системный статус" icon={<Server size={13} />} delay={60}>
            <FaultBlock />
            <KV k="Состояние заряда">{str(data?.chargeState)}</KV>
            <KV k="Контроллер (Modbus)">
              <SubsystemChip state={controllerState} />
            </KV>
            <KV k="BMS (JBD)">
              <SubsystemChip state={bmsState} />
            </KV>
            <KV k="Возраст данных BMS">{age(data?.bmsDataAgeMs ?? status?.bms_data_age_ms)}</KV>
            <KV k="Ошибки Modbus">{fmt(status?.modbus_errors, 0)}</KV>
            <KV k="Температура контроллера">{fmt(data?.controllerTemp, 1)} °C</KV>
          </Card>

          <Card title="Позиция солнца" icon={<Sun size={13} />} delay={120}>
            <EmptyState
              icon={CloudOff}
              title="Данные недоступны"
              hint="Backend не предоставляет данные о солнце и погоде"
              compact
            />
          </Card>
        </div>
      </div>

      {/* нижний ряд: батарея / PV / нагрузка */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
        <Card title="Батарея" icon={<BatteryCharging size={13} />} delay={40}>
          <div className="flex gap-4">
            <BatteryVisual soc={data?.batterySOC} charging={charging} height={138} />
            <div className="flex-1 space-y-2.5 min-w-0">
              <Metric label="Напряжение батареи" value={data?.batteryVoltage} digits={2} unitStr="V" source="/api/data · batteryVoltage" />
              <Metric label="Ток батареи" value={data?.batteryCurrent} digits={2} unitStr="A" sign source="/api/data · batteryCurrent" />
              <Metric label="Мощность батареи" value={data?.bmsPower} digits={1} unitStr="W" sign source="/api/data · bmsPower" />
              <div className="flex items-center gap-1.5 text-[11px] text-mut">
                <Thermometer size={12} />
                <span>Температура батареи</span>
                <span className="num ml-auto text-ink">{fmt(data?.batteryTemp, 1)} °C</span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Солнце · PV" icon={<Sun size={13} />} delay={90}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Metric
              label="Мощность PV"
              value={data?.pvPower}
              digits={1}
              unitStr="W"
              size="lg"
              tone="warn"
              source="/api/data · pvPower"
              className="col-span-2"
              sub={
                <span className="inline-flex items-center gap-1">
                  Мощность PV рассчитана из напряжения и тока PV
                </span>
              }
            />
            <Metric label="Напряжение PV" value={data?.pvVoltage} digits={1} unitStr="V" source="/api/data · pvVoltage" />
            <Metric label="Ток PV" value={data?.pvCurrent} digits={2} unitStr="A" source="/api/data · pvCurrent" />
            <Metric label="Мощность заряда" value={data?.chargePower} digits={1} unitStr="W" tone="ok" source="/api/data · chargePower" />
            <Metric label="Состояние заряда" valueText={str(data?.chargeState)} source="/api/data · chargeState" />
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
            <Metric
              label="Мощность нагрузки"
              value={data?.loadPower}
              digits={1}
              unitStr="W"
              size="lg"
              tone="bad"
              source="/api/data · loadPower"
              className="col-span-2"
            />
            <Metric label="Напряжение нагрузки" value={data?.loadVoltage} digits={1} unitStr="V" source="/api/data · loadVoltage" />
            <Metric label="Ток нагрузки" value={data?.loadCurrent} digits={2} unitStr="A" source="/api/data · loadCurrent" />
            <Metric label="Макс. ток нагрузки" value={data?.maxLoadCurrent} digits={1} unitStr="A" source="/api/data · maxLoadCurrent" />
            <Metric label="Макс. мощность нагрузки" value={data?.maxLoadPower} digits={0} unitStr="W" source="/api/data · maxLoadPower" />
          </div>
        </Card>
      </div>
    </div>
  );
}
