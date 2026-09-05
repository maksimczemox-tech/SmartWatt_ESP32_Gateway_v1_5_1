import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Power, RefreshCw, Save, Settings2, Wifi, XCircle } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, Btn, ConfirmDialog, EmptyState, KV, SectionTitle } from "../components/ui";
import { apiOriginLabel, DATA_SOURCE } from "../services/api";
import type { WifiData } from "../types";
import { firstDef, fmt, str, yesNo } from "../utils/format";

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
  "w-full bg-panel2 border border-line rounded px-2.5 py-2 text-[12.5px] text-ink placeholder:text-mut/60 outline-none focus:border-acc transition-colors";

export function SettingsPage() {
  const { fetchWifi, saveWifi, reboot, conn, rebooting, wsOpen, counters, refreshTelemetry } = useData();
  const [wifi, setWifi] = useState<WifiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

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
    setMsg({ tone: "ok", text: "Перезагрузка устройства... Ожидание восстановления связи." });
    void reboot();
  };

  const w = wifi ? normalizeWifi(wifi) : null;

  return (
    <div>
      {/* СВЯЗЬ */}
      <Card title="Связь с Gateway" icon={<Settings2 size={13} />} delay={0}>
        <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <SectionTitle>Подключение</SectionTitle>
            <KV k="Адрес Gateway">{apiOriginLabel()}</KV>
            <KV k="Источник данных">{DATA_SOURCE === "live" ? "LIVE (реальные данные)" : DATA_SOURCE}</KV>
            <KV k="WebSocket (порт 81)">
              {wsOpen ? (
                <span className="text-ok">открыт</span>
              ) : (
                <span className="text-mut">закрыт · опрос HTTP активен</span>
              )}
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
              Это счётчики запросов, выполненных интерфейсом браузера. Диагностика ESP32
              (Modbus / JBD / CRC) отображается в инженерном режиме.
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
        <p className="text-[10.5px] text-mut/70 mt-2.5 leading-relaxed">
          Адрес Gateway задаётся переменной окружения <span className="num text-mut">VITE_GATEWAY_URL</span>.
          Если переменная не задана, запросы выполняются на тот же адрес, с которого открыт интерфейс
          (фронтенд на самом ESP32).
        </p>
      </Card>

      {/* WI-FI */}
      <Card
        title="Wi-Fi"
        icon={<Wifi size={13} />}
        delay={60}
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
        <p className="text-[10.5px] text-mut/70 mt-3 leading-relaxed">
          Пароль Wi-Fi никогда не отображается: если backend не возвращает его, интерфейс показывает
          только факт сохранённого пароля.
        </p>

        {/* смена Wi-Fi */}
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
