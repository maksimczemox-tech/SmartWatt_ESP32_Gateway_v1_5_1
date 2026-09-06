import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Power,
  RefreshCw,
  Save,
  Settings2,
  Wifi,
  XCircle,
} from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Btn, ConfirmDialog, EmptyState, KV, SectionTitle } from "../components/ui";
import { apiOriginLabel, DATA_SOURCE } from "../services/api";
import { useSettings } from "../hooks/useSettings";
import type { WifiData } from "../types";
import { firstDef, fmt, str, yesNo } from "../utils/format";
import type { ForecastMode } from "../utils/energy";

function normalizeWifi(w: WifiData) {
  return {
    ssid: str(w.ssid),
    passwordSaved: yesNo(firstDef(w.password_saved, w.passwordSaved)),
    connected: yesNo(w.connected),
    connectedSsid: str(firstDef(w.connected_ssid, w.connectedSsid)),
    staIp: str(firstDef(w.sta_ip, w.staIp, w.ip)),
    rssi: w.rssi ?? null,
    apEnabled: yesNo(firstDef(w.ap_enabled, w.apEnabled)),
    apSsid: str(firstDef(w.ap_ssid, w.apSsid)),
    apIp: str(firstDef(w.ap_ip, w.apIp)),
    apClients: firstDef(w.ap_clients, w.apClients) ?? null,
    apChannel: firstDef(w.ap_channel, w.apChannel) ?? null,
    apMaxClients: firstDef(w.ap_max_clients, w.apMaxClients) ?? null,
    apDhcp: str(firstDef(w.ap_dhcp, w.apDhcp)),
  };
}

const inputCls =
  "w-full bg-panel2 border border-line rounded px-2.5 py-2 text-[12.5px] text-ink placeholder:text-mut/60 outline-none focus:border-acc transition-colors num";

export function SettingsPage() {
  const { fetchWifi, saveWifi, reboot, conn, rebooting, wsOpen, counters, refreshTelemetry } = useData();
  const [settings, setSettings] = useSettings();

  const [wifi, setWifi] = useState<WifiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const [latInput, setLatInput] = useState(settings.lat === null ? "" : String(settings.lat));
  const [lonInput, setLonInput] = useState(settings.lon === null ? "" : String(settings.lon));
  const [minSocInput, setMinSocInput] = useState(String(settings.minSoc));
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [confirmWifi, setConfirmWifi] = useState(false);
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = () => {
    setLoading(true);
    setFailed(false);
    fetchWifi()
      .then((w) => setWifi(w))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveGeo = () => {
    const lat = latInput.trim() === "" ? null : Number(latInput.replace(",", "."));
    const lon = lonInput.trim() === "" ? null : Number(lonInput.replace(",", "."));
    if ((lat !== null && !Number.isFinite(lat)) || (lat !== null && (lat < -90 || lat > 90))) {
      setGeoMsg("Широта должна быть в диапазоне от −90 до 90");
      return;
    }
    if ((lon !== null && !Number.isFinite(lon)) || (lon !== null && (lon < -180 || lon > 180))) {
      setGeoMsg("Долгота должна быть в диапазоне от −180 до 180");
      return;
    }
    setSettings({ lat, lon });
    setGeoMsg(lat === null || lon === null ? "Координаты удалены — расчёт Солнца отключён" : "Координаты сохранены в браузере");
  };

  const saveMinSoc = () => {
    const v = Number(minSocInput);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      setGeoMsg("Минимальный SOC должен быть в диапазоне 0–100 %");
      return;
    }
    setSettings({ minSoc: Math.round(v) });
    setGeoMsg(null);
  };

  const doSaveWifi = () => {
    setSaving(true);
    saveWifi(ssid.trim(), pass)
      .then(() => {
        setMsg({ tone: "ok", text: "Настройки Wi-Fi отправлены на Gateway" });
        setConfirmWifi(false);
        setPass("");
        window.setTimeout(load, 1500);
      })
      .catch(() => setMsg({ tone: "err", text: "Не удалось отправить настройки (POST /api/wifi)" }))
      .finally(() => setSaving(false));
  };

  const doReboot = () => {
    setConfirmReboot(false);
    setMsg({ tone: "ok", text: "Перезагрузка устройства... Восстановление связи..." });
    void reboot();
  };

  const w = wifi ? normalizeWifi(wifi) : null;

  return (
    <div>
      {/* НАСТРОЙКИ ИНТЕРФЕЙСА (localStorage) */}
      <Card title="Настройки интерфейса" icon={<Settings2 size={13} />} delay={0}>
        <div className="grid lg:grid-cols-2 gap-x-8 gap-y-5">
          {/* Местоположение */}
          <div>
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5"><MapPin size={11} /> Местоположение (расчёт Солнца)</span>
            </SectionTitle>
            <div className="grid grid-cols-2 gap-2.5 max-w-md">
              <div>
                <label className="text-[10px] uppercase tracking-[0.14em] text-mut block mb-1">Широта</label>
                <input className={inputCls} value={latInput} onChange={(e) => setLatInput(e.target.value)} placeholder="Например: 55.7558" inputMode="decimal" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.14em] text-mut block mb-1">Долгота</label>
                <input className={inputCls} value={lonInput} onChange={(e) => setLonInput(e.target.value)} placeholder="Например: 37.6176" inputMode="decimal" />
              </div>
            </div>
            <div className="flex items-center gap-2.5 mt-2">
              <Btn tone="primary" onClick={saveGeo}>
                <Save size={12} />
                Сохранить координаты
              </Btn>
              {geoMsg && <span className="text-[11px] text-mut">{geoMsg}</span>}
            </div>
            <p className="text-[10.5px] text-mut/70 mt-2 leading-relaxed max-w-md">
              Координаты используются только браузером для астрономического расчёта положения Солнца
              (азимут, высота, восход, закат). В ESP32 они не отправляются — такого API в прошивке нет.
              Пустые поля — расчёт отключён («Местоположение не задано»).
            </p>
          </div>

          {/* Прогнозы */}
          <div>
            <SectionTitle>Расчетные показатели</SectionTitle>
            <div className="max-w-md">
              <label className="text-[10px] uppercase tracking-[0.14em] text-mut block mb-1">
                Минимальный SOC для расчёта автономности, %
              </label>
              <div className="flex gap-2.5">
                <input className={inputCls} value={minSocInput} onChange={(e) => setMinSocInput(e.target.value)} inputMode="numeric" />
                <Btn tone="primary" onClick={saveMinSoc}>
                  <Save size={12} />
                  Сохранить
                </Btn>
              </div>
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-[0.14em] text-mut mb-1">Режим прогноза зарядки</div>
                <div className="flex gap-1.5">
                  {(
                    [
                      ["current", "Текущая мощность"],
                      ["average", "Средняя мощность"],
                    ] as [ForecastMode, string][]
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSettings({ forecastMode: m })}
                      className={`px-3 py-1.5 rounded border text-[11px] font-semibold transition-colors ${
                        settings.forecastMode === m
                          ? "border-acc/60 bg-acc/15 text-acc2"
                          : "border-line bg-panel2 text-mut hover:text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10.5px] text-mut/70 mt-2.5 leading-relaxed">
                Автономность учитывает энергию только между текущим SOC и заданным минимумом (по умолчанию 20 %).
                «Средняя мощность» — среднее по реально полученным фреймам за последние 15 минут.
                Все настройки хранятся в localStorage браузера.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* СВЯЗЬ */}
      <Card title="Связь с Gateway" icon={<Settings2 size={13} />} delay={50} className="mt-3">
        <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <SectionTitle>Подключение</SectionTitle>
            <KV k="Адрес Gateway">{apiOriginLabel()}</KV>
            <KV k="Источник данных">{DATA_SOURCE === "live" ? "LIVE (реальные данные)" : DATA_SOURCE}</KV>
            <KV k="WebSocket (порт 81)">
              {wsOpen ? <span className="text-ok">открыт</span> : <span className="text-mut">закрыт · опрос HTTP активен</span>}
            </KV>
            <KV k="Статус соединения">
              {conn === "ONLINE"
                ? "В СЕТИ"
                : conn === "OFFLINE"
                  ? "НЕТ СВЯЗИ"
                  : conn === "STALE"
                    ? "ДАННЫЕ УСТАРЕЛИ"
                    : conn === "RECONNECTING"
                      ? "ВОССТАНОВЛЕНИЕ СВЯЗИ"
                      : "ПОДКЛЮЧЕНИЕ"}
            </KV>
          </div>
          <div>
            <SectionTitle>Счётчики интерфейса (браузер)</SectionTitle>
            <KV k="HTTP-запросы интерфейса">{counters.requests}</KV>
            <KV k="Ошибки HTTP интерфейса">{counters.errors}</KV>
            <p className="text-[10.5px] text-mut/70 leading-relaxed mt-2">
              Это счётчики браузера. Диагностика ESP32 (Modbus / JBD / CRC) — в инженерном режиме.
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-line/60 flex-wrap">
          <Btn onClick={() => void refreshTelemetry()}>
            <RefreshCw size={12} />
            Обновить телеметрию
          </Btn>
          <Btn tone="danger" onClick={() => setConfirmReboot(true)}>
            <Power size={12} />
            Перезагрузить устройство
          </Btn>
          {rebooting && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-warn">
              <Loader2 size={12} className="spin" />
              {conn === "ONLINE" ? "Устройство снова в сети" : "Перезагрузка устройства... Восстановление связи..."}
            </span>
          )}
        </div>
      </Card>

      {/* WI-FI */}
      <Card
        title="Wi-Fi"
        icon={<Wifi size={13} />}
        delay={90}
        className="mt-3"
        right={
          <Btn onClick={load} busy={loading}>
            <RefreshCw size={12} />
            Обновить
          </Btn>
        }
      >
        {failed ? (
          <EmptyState title="Данные Wi-Fi недоступны" hint="GET /api/wifi не ответил" compact />
        ) : !w ? (
          <div className="flex items-center gap-2 text-[11.5px] text-mut py-3">
            <Loader2 size={13} className="spin" />
            Ожидание данных...
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-x-8">
            <div>
              <SectionTitle>Станция (STA)</SectionTitle>
              <KV k="Имя сети (SSID)">{w.ssid}</KV>
              <KV k="Пароль сохранён">{w.passwordSaved}</KV>
              <KV k="Подключено">{w.connected}</KV>
              <KV k="Подключённая сеть">{w.connectedSsid}</KV>
              <KV k="IP-адрес">{w.staIp}</KV>
              <KV k="Уровень сигнала (RSSI)">{w.rssi === null ? "—" : `${fmt(w.rssi, 0)} dBm`}</KV>
            </div>
            <div>
              <SectionTitle>Точка доступа (AP)</SectionTitle>
              <KV k="Точка доступа">{w.apEnabled}</KV>
              <KV k="Имя сети AP">{w.apSsid}</KV>
              <KV k="IP точки доступа">{w.apIp}</KV>
              <KV k="Клиенты">{fmt(w.apClients, 0)}</KV>
              <KV k="Канал">{fmt(w.apChannel, 0)}</KV>
              <KV k="Максимум клиентов">{fmt(w.apMaxClients, 0)}</KV>
              <KV k="DHCP">{w.apDhcp}</KV>
            </div>
          </div>
        )}
        <p className="text-[10.5px] text-mut/70 mt-3">
          Пароль Wi-Fi никогда не отображается: если backend его не возвращает, показывается только факт сохранения.
        </p>

        <div className="mt-3 pt-3 border-t border-line/60">
          <SectionTitle>Изменить подключение</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-2.5 max-w-xl">
            <div>
              <label className="text-[10px] uppercase tracking-[0.14em] text-mut block mb-1">Имя сети (SSID)</label>
              <input className={inputCls} value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="Имя сети" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.14em] text-mut block mb-1">Пароль</label>
              <input
                className={inputCls}
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Пароль Wi-Fi"
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2.5">
            <Btn tone="primary" disabled={ssid.trim() === ""} onClick={() => setConfirmWifi(true)}>
              <Save size={12} />
              Сохранить Wi-Fi
            </Btn>
            {msg && (
              <span className={`inline-flex items-center gap-1.5 text-[11px] ${msg.tone === "ok" ? "text-ok" : "text-bad"}`}>
                {msg.tone === "ok" ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {msg.text}
              </span>
            )}
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmWifi}
        title="Сохранить настройки Wi-Fi?"
        body={`Gateway получит новую конфигурацию Wi-Fi: сеть «${ssid.trim()}». Пароль не отображается и не сохраняется в интерфейсе. Устройство может переподключиться — соединение временно прервётся.`}
        confirmLabel="Сохранить"
        busy={saving}
        onCancel={() => setConfirmWifi(false)}
        onConfirm={doSaveWifi}
      />

      <ConfirmDialog
        open={confirmReboot}
        title="Перезагрузить устройство?"
        body="ESP32 Gateway будет перезагружен (POST /api/reboot). Телеметрия станет недоступна на время перезагрузки, затем связь восстановится автоматически."
        confirmLabel="Перезагрузить"
        onCancel={() => setConfirmReboot(false)}
        onConfirm={doReboot}
      />
    </div>
  );
}
