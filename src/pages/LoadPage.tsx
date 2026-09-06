import { useState } from "react";
import { Info, Plug, Zap } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Metric, OnOffChip, KV } from "../components/ui";
import { SamplesChart, WindowSwitch, type SeriesDef } from "../components/charts";
import { estimatedLoadPower } from "../utils/energy";
import { boolChip, fmt, fmtTime, num } from "../utils/format";

const S_LOAD: SeriesDef = { key: "load", name: "Расчётная нагрузка", color: "#FF3D32", unit: "W" };

export function LoadPage() {
  const { data, bat, samples, sessionStart } = useData();
  const [windowH, setWindowH] = useState<number | null>(6);

  const pv = num(data?.pvPower);
  const batt = bat.power;
  const load = estimatedLoadPower(pv, batt);

  return (
    <div>
      {/* расчётная нагрузка */}
      <Card
        title="Расчётная нагрузка"
        icon={<Plug size={13} />}
        delay={0}
        right={
          <span className="text-[9px] tracking-[0.14em] uppercase text-mut border border-line rounded-sm px-1.5 py-px">
            расчёт
          </span>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="Мощность нагрузки" value={load} digits={1} unitStr="W" size="lg" tone="bad" source="расчёт · max(0, PV − АКБ)" />
          <Metric label="Мощность PV" value={pv} digits={1} unitStr="W" source="/api/data · pvPower" />
          <Metric label="Мощность АКБ" value={batt} digits={1} unitStr="W" sign source="/api/data · bmsPower → /api/bms" />
          <Metric label="Формула" valueText="max(0, PV − АКБ)" source="энергетический баланс" />
        </div>
        <p className="text-[10.5px] text-mut/80 leading-relaxed mt-3">
          Нагрузка физически подключена к аккумулятору, а не к выходу LOAD контроллера.
          BMS &gt; 0 — аккумулятор заряжается, BMS &lt; 0 — разряжается.
          {load === null && pv !== null && batt === null && " Недостаточно данных: нет мощности АКБ."}
          {load === null && pv === null && " Недостаточно данных: нет мощности PV."}
        </p>
      </Card>

      {/* график расчётной нагрузки */}
      <Card
        title="Расчётная нагрузка · график"
        icon={<Plug size={13} />}
        delay={60}
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
        <SamplesChart samples={samples} series={[S_LOAD]} windowHours={windowH} sessionStart={sessionStart} height={225} />
        <p className="text-[10px] text-mut/70 mt-2">
          Каждая точка рассчитана из реального sample: max(0, PV − АКБ). История — с момента запуска интерфейса ({fmtTime(sessionStart)}).
        </p>
      </Card>

      {/* выход LOAD контроллера — поля прошивки, НЕ источник нагрузки */}
      <Card
        title="Выход LOAD контроллера (Modbus)"
        icon={<Zap size={13} />}
        delay={110}
        className="mt-3"
        right={
          <span className="inline-flex items-center gap-1.5 text-[9.5px] text-warn border border-warn/40 bg-warn/10 rounded-sm px-1.5 py-px">
            <Info size={10} />
            не используется для расчёта нагрузки
          </span>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Metric label="Состояние выхода" valueText={boolChip(data?.loadState) === null ? "—" : boolChip(data?.loadState) === "ON" ? "ВКЛ" : "ВЫКЛ"} source="/api/data · loadState" />
          <Metric label="Напряжение выхода" value={data?.loadVoltage} digits={1} unitStr="V" source="/api/data · loadVoltage" />
          <Metric label="Ток выхода" value={data?.loadCurrent} digits={2} unitStr="A" source="/api/data · loadCurrent" />
          <Metric label="loadPower контроллера" value={data?.loadPower} digits={1} unitStr="W" source="/api/data · loadPower"
            sub={<span className="text-warn/90">Поле контроллера — не используется для расчёта нагрузки</span>} />
          <Metric label="Макс. ток выхода" value={data?.maxLoadCurrent} digits={1} unitStr="A" source="/api/data · maxLoadCurrent" />
        </div>
        <div className="mt-3 pt-2.5 border-t border-line/60 grid sm:grid-cols-2 gap-x-8">
          <KV k="Максимальная мощность выхода">{fmt(data?.maxLoadPower, 0)} W</KV>
          <KV k="Основной расчёт нагрузки">Расчётная нагрузка = PV − АКБ</KV>
        </div>
      </Card>
    </div>
  );
}
