import { useEffect, useState } from "react";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Metric, EmptyState, IconBtn } from "../components/ui";
import { HistoryChart, type SeriesDef } from "../components/charts";
import type { HistoryPoint, HistoryRange } from "../types";
import { fmtDateTime, kwh } from "../utils/format";

const S_PV: SeriesDef = { key: "pv", name: "PV", color: "#FFC400", unit: "W" };
const S_BATT: SeriesDef = { key: "batt", name: "Battery", color: "#2F9BE8", unit: "W" };
const S_LOAD: SeriesDef = { key: "load", name: "Load", color: "#FF3D32", unit: "W" };
const S_SOC: SeriesDef = { key: "soc", name: "SOC", color: "#70D900", unit: "%" };

export function StatsPage() {
  const { data, fetchHistory } = useData();
  const [range, setRange] = useState<HistoryRange>("default");
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = (r: HistoryRange) => {
    setLoading(true);
    setFailed(false);
    fetchHistory(r)
      .then((p) => {
        setPoints(p);
        setLoadedAt(Date.now());
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <div>
      {/* накопительная статистика */}
      <Card title="Статистика · Накопленные значения" icon={<BarChart3 size={13} />} delay={0}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Metric label="Daily Charge" value={data?.dailyChargeAh} digits={1} unitStr="Ah" source="/api/data · dailyChargeAh" />
          <Metric label="Daily Load" value={data?.dailyLoadAh} digits={1} unitStr="Ah" source="/api/data · dailyLoadAh" />
          <Metric label="Total Charge" value={data?.totalChargeAh} digits={1} unitStr="Ah" source="/api/data · totalChargeAh" />
          <Metric label="Total Load" value={data?.totalLoadAh} digits={1} unitStr="Ah" source="/api/data · totalLoadAh" />
          <Metric label="Running Days" value={data?.runningDays} digits={0} unitStr="дн" source="/api/data · runningDays" />
          <Metric label="Total Charge Energy" value={data?.totalChargeWh} digits={0} unitStr="Wh" source="/api/data · totalChargeWh"
            sub={<span className="num">{kwh(data?.totalChargeWh)}</span>} />
          <Metric label="Total Load Energy" value={data?.totalLoadWh} digits={0} unitStr="Wh" source="/api/data · totalLoadWh"
            sub={<span className="num">{kwh(data?.totalLoadWh)}</span>} />
          <Metric label="Full Charges" value={data?.fullCharges} digits={0} source="/api/data · fullCharges" />
          <Metric label="Over Discharges" value={data?.overDischarges} digits={0} tone="bad" source="/api/data · overDischarges" />
        </div>
      </Card>

      {/* история */}
      <Card
        title="История · GET /api/history"
        icon={<BarChart3 size={13} />}
        delay={60}
        className="mt-3"
        right={
          <div className="flex items-center gap-2">
            <div className="flex rounded border border-line overflow-hidden">
              {(
                [
                  ["default", "Стандарт"],
                  ["7d", "7 дней"],
                ] as [HistoryRange, string][]
              ).map(([r, label]) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors ${
                    range === r ? "bg-acc text-white" : "text-mut hover:text-ink bg-panel2"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="num text-[9.5px] text-mut hidden sm:inline">
              {points.length} pts{loadedAt ? ` · ${fmtDateTime(loadedAt)}` : ""}
            </span>
            <IconBtn title="Обновить историю" onClick={() => load(range)} busy={loading}>
              <RefreshCw size={12} />
            </IconBtn>
          </div>
        }
        bodyClassName="p-0"
      >
        {loading && points.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-mut text-[12px]">
            <Loader2 size={15} className="spin" />
            Загрузка истории…
          </div>
        ) : failed ? (
          <EmptyState title="История недоступна" hint="GET /api/history не ответил" compact />
        ) : (
          <div className="grid lg:grid-cols-2 gap-x-3 gap-y-4 p-3.5">
            <div>
              <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">SOC History</div>
              <HistoryChart points={points} series={[S_SOC]} />
            </div>
            <div>
              <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">PV Power History</div>
              <HistoryChart points={points} series={[S_PV]} />
            </div>
            <div>
              <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">Battery Power History</div>
              <HistoryChart points={points} series={[S_BATT]} />
            </div>
            <div>
              <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">Load Power History</div>
              <HistoryChart points={points} series={[S_LOAD]} />
            </div>
            <div className="lg:col-span-2">
              <div className="text-[10px] tracking-[0.16em] uppercase text-mut mb-1.5">Energy History</div>
              <HistoryChart points={points} series={[S_PV, S_BATT, S_LOAD]} height={230} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
