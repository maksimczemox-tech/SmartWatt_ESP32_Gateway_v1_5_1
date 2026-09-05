import { useEffect, useState } from "react";
import { Info, RefreshCw, Sun, Zap } from "lucide-react";
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
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setFailed(false);
    fetchHistory("default")
      .then((p) => {
        setPoints(p);
        setLoadedAt(Date.now());
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Card title="Солнце · PV Телеметрия" icon={<Sun size={13} />} delay={0}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric label="PV Power" value={data?.pvPower} digits={1} unitStr="W" size="lg" tone="warn" source="/api/data · pvPower"
            sub={
              <span className="inline-flex items-center gap-1">
                <Info size={10} className="text-mut/70" />
                PV Power derived from PV voltage and current
              </span>
            }
          />
          <Metric label="PV Voltage" value={data?.pvVoltage} digits={1} unitStr="V" size="lg" source="/api/data · pvVoltage" />
          <Metric label="PV Current" value={data?.pvCurrent} digits={2} unitStr="A" size="lg" source="/api/data · pvCurrent" />
          <Metric label="Charge Power" value={data?.chargePower} digits={1} unitStr="W" size="lg" tone="ok" source="/api/data · chargePower" />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <Card
          title="PV Power History"
          icon={<Sun size={13} />}
          className="lg:col-span-2"
          delay={60}
          right={
            <div className="flex items-center gap-2">
              <span className="num text-[9.5px] text-mut">{points.length} pts</span>
              <IconBtn title="Обновить историю" onClick={load} busy={loading}>
                <RefreshCw size={12} />
              </IconBtn>
            </div>
          }
        >
          {failed ? (
            <EmptyState title="История недоступна" hint="GET /api/history не ответил" compact />
          ) : (
            <HistoryChart points={points} series={[{ key: "pv", name: "PV Power", color: "#FFC400", unit: "W" }]} height={230} />
          )}
        </Card>

        <div className="space-y-3">
          <Card title="Лимиты зарядки" icon={<Zap size={13} />} delay={110}>
            <Metric label="Max Charge Current" value={data?.maxChargeCurrent} digits={1} unitStr="A" source="/api/data · maxChargeCurrent" />
            <div className="h-3" />
            <Metric label="Max Charge Power" value={data?.maxChargePower} digits={0} unitStr="W" source="/api/data · maxChargePower" />
          </Card>

          <Card title="Состояние контроллера" icon={<Zap size={13} />} delay={160}>
            <KV k="Controller">{controllerState === "NO_DATA" ? "НЕТ ДАННЫХ" : controllerState}</KV>
            <KV k="Charge state">{str(data?.chargeState)}</KV>
            <KV k="Controller temp">{fmt(data?.controllerTemp, 1)} °C</KV>
            <KV k="Fault">{str(data?.faultDescription)}</KV>
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
