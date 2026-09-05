import { useEffect, useState } from "react";
import { RefreshCw, Sun, Zap } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Metric, Btn, EmptyState, KV, IconBtn } from "../components/ui";
import { HistoryChart } from "../components/charts";
import type { HistoryPoint } from "../types";
import { fmt, str } from "../utils/format";

export function SolarPage() {
  const { data, fetchHistory, controllerState } = useData();
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    fetchHistory("default")
      .then((p) => setPoints(p))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            sub={<span>Мощность PV рассчитана из напряжения и тока PV</span>}
          />
          <Metric label="Напряжение PV" value={data?.pvVoltage} digits={1} unitStr="V" size="lg" source="/api/data · pvVoltage" />
          <Metric label="Ток PV" value={data?.pvCurrent} digits={2} unitStr="A" size="lg" source="/api/data · pvCurrent" />
          <Metric label="Мощность заряда" value={data?.chargePower} digits={1} unitStr="W" size="lg" tone="ok" source="/api/data · chargePower" />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <Card
          title="История мощности PV"
          icon={<Sun size={13} />}
          className="lg:col-span-2"
          delay={60}
          right={
            <div className="flex items-center gap-2">
              <span className="num text-[9.5px] text-mut">точек: {points.length}</span>
              <IconBtn title="Обновить историю (GET /api/history)" onClick={load} busy={loading}>
                <RefreshCw size={12} />
              </IconBtn>
            </div>
          }
        >
          {failed ? (
            <EmptyState title="История недоступна" hint="GET /api/history не ответил" compact />
          ) : (
            <HistoryChart
              points={points}
              series={[{ key: "pv", name: "Мощность PV", color: "#FFC400", unit: "W" }]}
              height={230}
            />
          )}
        </Card>

        <div className="space-y-3">
          <Card title="Лимиты зарядки" icon={<Zap size={13} />} delay={110}>
            <Metric label="Макс. ток заряда" value={data?.maxChargeCurrent} digits={1} unitStr="A" source="/api/data · maxChargeCurrent" />
            <div className="h-3" />
            <Metric label="Макс. мощность заряда" value={data?.maxChargePower} digits={0} unitStr="W" source="/api/data · maxChargePower" />
          </Card>

          <Card title="Состояние контроллера" icon={<Zap size={13} />} delay={160}>
            <KV k="Контроллер">
              {controllerState === "ONLINE"
                ? "В СЕТИ"
                : controllerState === "OFFLINE"
                  ? "НЕТ СВЯЗИ"
                  : controllerState === "STALE"
                    ? "ДАННЫЕ УСТАРЕЛИ"
                    : "НЕТ ДАННЫХ"}
            </KV>
            <KV k="Состояние заряда">{str(data?.chargeState)}</KV>
            <KV k="Температура контроллера">{fmt(data?.controllerTemp, 1)} °C</KV>
            <KV k="Неисправность">{str(data?.faultDescription)}</KV>
          </Card>

          <div className="reveal" style={{ animationDelay: "200ms" }}>
            <Btn tone="ghost" onClick={load} busy={loading}>
              <RefreshCw size={12} />
              Обновить историю
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
