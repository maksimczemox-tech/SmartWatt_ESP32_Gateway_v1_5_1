import { useEffect, useState } from "react";
import { CheckCircle2, Power, RefreshCw, Router, Server, Wifi, XCircle } from "lucide-react";
import { useData } from "../store/DataContext";
import { Card, KV, Btn, IconBtn, ConfirmDialog, OnOffChip, EmptyState, StatusPill } from "../components/ui";
import { apiOriginLabel, wsUrl, DATA_SOURCE } from "../services/api";
import type { WifiData } from "../types";
import { boolChip, dur, fmt, kbytes, str, toBool } from "../utils/format";

interface Msg {
  tone: "ok" | "bad";
  text: string;
}

export function SettingsPage() {
  const { conn, version, status, fetchWifi, saveWifi, reboot } = useData();

  const [wifi, setWifi] = useState<WifiData | null>(null);
  const [wifiLoading, setWifiLoading] = useState(false);
  const [wifiFailed, setWifiFailed] = useState(false);
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [confirmWifi, setConfirmWifi] = useState(false);
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const loadWifi = () => {
    setWifiLoading(true);
    setWifiFailed(false);
    fetchWifi()
      .then((w) => setWifi(w))
      .catch(() => setWifiFailed(true))
      .finally(() => setWifiLoading(false));
  };

  useEffect(() => {
    loadWifi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSaveWifi = () => {
    setSaving(true);
    saveWifi(ssid.trim(), pass)
      .then(() => {
        setMsg({ tone: "ok", text: "Wi-Fi конфигурация отправлена на Gateway" });
        setConfirmWifi(false);
        setPass("");
        loadWifi();
      })
      .catch(() => setMsg({ tone: "bad", text: "POST /api/wifi не выполнен — Gateway не ответил" }))
      .finally(() => setSaving(false));
  };

  const doReboot = () => {
    setRebooting(true);
    setMsg(null);
    reboot()
      .then(() => setMsg({ tone: "ok", text: "Device restarting... Подключение будет восстановлено автоматически" }))
      .catch(() => {
        setMsg({ tone: "bad", text: "POST /api/reboot не выполнен" });
        setRebooting(false);
      });
  };

  const inputCls =
    "w-full bg-bg border border-line rounded px-2.5 py-[7px] text-[12.5px] text-ink placeholder:text-mut/50 outline-none focus:border-acc transition-colors";

  return (
    <div>
      <div className="grid lg:grid-cols-2 gap-3">
        {/* CONNECTION */}
        <Card title="Подключение · Connection" icon={<Server size={13} />} delay={0}>
          <KV k="Статус">
            <StatusPill status={conn} compact />
          </KV>
          <KV k="HTTP API">{apiOriginLabel()}</KV>
          <KV k="WebSocket (порт 81)">{wsUrl()}</KV>
          <KV k="Data source">{DATA_SOURCE.toUpperCase()}</KV>
          <p className="text-[10.5px] text-mut/80 leading-relaxed mt-2.5">
            Адрес Gateway задаётся переменной <span className="num text-mut">VITE_GATEWAY_URL</span>. Если она не задана,
            используются same-origin запросы — фронтенд открывается непосредственно с ESP32.
          </p>
        </Card>

        {/* DEVICE */}
        <Card title="Устройство" icon={<Server size={13} />} delay={50}>
          <KV k="Device">{str(status?.device)}</KV>
          <KV k="Firmware version">
            {str(version?.firmware_version) !== "—" ? str(version?.firmware_version) : str(version?.version)}
          </KV>
          <KV k="Uptime">{dur(status?.uptime_ms)}</KV>
          <KV k="Free heap">{kbytes(status?.free_heap)}</KV>
          <KV k="Min free heap">{kbytes(status?.min_free_heap)}</KV>
          <div className="mt-3.5 flex items-center gap-2.5">
            <Btn tone="danger" onClick={() => setConfirmReboot(true)}>
              <Power size={12} />
              Reboot Device
            </Btn>
            {rebooting && <span className="text-[11px] text-warn blink-soft">Device restarting...</span>}
          </div>
        </Card>
      </div>

      {/* WI-FI */}
      <Card
        title="Wi-Fi"
        icon={<Wifi size={13} />}
        delay={100}
        className="mt-3"
        right={<IconBtn title="Обновить (GET /api/wifi)" onClick={loadWifi} busy={wifiLoading}><RefreshCw size={12} /></IconBtn>}
      >
        {wifiFailed ? (
          <EmptyState title="Wi-Fi данные недоступны" hint="GET /api/wifi не ответил" compact />
        ) : wifi === null ? (
          <div className="text-[11.5px] text-mut py-3">Загрузка…</div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-x-6">
            <div>
              <KV k="SSID">{str(wifi.ssid)}</KV>
              <KV k="Password saved">
                {toBool(wifi.password_saved ?? wifi.passwordSaved) === null ? "—" : toBool(wifi.password_saved ?? wifi.passwordSaved) ? "Yes" : "No"}
              </KV>
              <KV k="Connected">
                <OnOffChip value={boolChip(wifi.connected)} />
              </KV>
              <KV k="Connected SSID">{str(wifi.connected_ssid ?? wifi.connectedSsid)}</KV>
              <KV k="STA IP">{str(wifi.sta_ip ?? wifi.staIp ?? wifi.ip)}</KV>
              <KV k="RSSI">{fmt(wifi.rssi, 0)} dBm</KV>
            </div>
            <div>
              <KV k="AP enabled">
                <OnOffChip value={boolChip(wifi.ap_enabled ?? wifi.apEnabled)} />
              </KV>
              <KV k="AP SSID">{str(wifi.ap_ssid ?? wifi.apSsid)}</KV>
              <KV k="AP IP">{str(wifi.ap_ip ?? wifi.apIp)}</KV>
              <KV k="AP clients">{fmt(wifi.ap_clients ?? wifi.apClients, 0)}</KV>
              <KV k="AP channel">{fmt(wifi.ap_channel ?? wifi.apChannel, 0)}</KV>
              <KV k="AP max clients">{fmt(wifi.ap_max_clients ?? wifi.apMaxClients, 0)}</KV>
              <KV k="AP DHCP">
                {(() => {
                  const v = wifi.ap_dhcp ?? wifi.apDhcp;
                  const b = toBool(v);
                  if (b !== null) return b ? "ON" : "OFF";
                  return str(v);
                })()}
              </KV>
            </div>
          </div>
        )}

        {/* форма изменения */}
        <div className="mt-4 pt-3.5 border-t border-line">
          <div className="flex items-center gap-2 mb-2.5">
            <Router size={13} className="text-mut" />
            <span className="text-[10px] tracking-[0.16em] uppercase text-mut font-semibold">Изменить Wi-Fi (POST /api/wifi)</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5 max-w-xl">
            <input
              className={inputCls}
              placeholder="SSID сети"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              autoComplete="off"
            />
            <input
              className={inputCls}
              type="password"
              placeholder="Пароль (никогда не отображается)"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex items-center gap-3 mt-2.5">
            <Btn tone="primary" disabled={ssid.trim() === ""} onClick={() => setConfirmWifi(true)}>
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
        title="Изменить Wi-Fi?"
        body={
          <>
            Gateway получит новую конфигурацию Wi-Fi: SSID <span className="num text-ink">{ssid}</span>. Пароль не
            отображается и не сохраняется в интерфейсе. Устройство может переподключиться — соединение временно прервётся.
          </>
        }
        confirmLabel="Применить"
        tone="primary"
        busy={saving}
        onCancel={() => setConfirmWifi(false)}
        onConfirm={doSaveWifi}
      />

      <ConfirmDialog
        open={confirmReboot}
        title="Confirm reboot?"
        body="ESP32 Gateway будет перезагружен. Телеметрия станет недоступна на время перезагрузки, затем соединение восстановится автоматически (RECONNECTING → ONLINE)."
        confirmLabel="Reboot"
        busy={rebooting}
        onCancel={() => setConfirmReboot(false)}
        onConfirm={doReboot}
      />
    </div>
  );
}
