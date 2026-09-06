#pragma once
// ============================================================================
// SmartWatt ESP32 Gateway — встроенный резервный веб-интерфейс (INDEX_HTML).
//
// Отдаётся через server.send_P() с маршрута "/" (см. setupWebServer в .ino).
// Полностью автономен: без внешних шрифтов, CDN и картинок — работает
// из резервной точки доступа (192.168.4.1) без интернета.
//
// Данные — ТОЛЬКО реальные: GET /api/data (поллинг-фолбэк) и WebSocket :81.
// Отсутствующие значения показываются как "—", никогда не подменяются нулём.
// Расчётная нагрузка = max(0, PV − BMS) — берётся из поля loadPower прошивки
// (loadSource = CALCULATED_FROM_PV_AND_JBD_BMS).
// ============================================================================

#include <pgmspace.h>

const char INDEX_HTML[] PROGMEM = R"SMARTWATT_UI(<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SmartWatt · Шлюз</title>
<style>
:root{
  --bg:#050A10; --panel:#0B151E; --panel2:#101B25; --line:#1A2A35; --line2:#27404F;
  --acc:#0878D1; --acc2:#2F9BE8; --ok:#70D900; --warn:#FFC400; --bad:#FF3D32;
  --ink:#F1F4F6; --mut:#8A969F;
  --mono:ui-monospace,"Cascadia Mono","SF Mono",Menlo,Consolas,monospace;
  --sans:system-ui,"Segoe UI",-apple-system,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  background:var(--bg); color:var(--ink); font-family:var(--sans);
  -webkit-font-smoothing:antialiased; font-size:13px;
}
/* многослойный фон: сетка + свечения + сканлайны */
body::before{
  content:""; position:fixed; inset:0; z-index:-2; pointer-events:none;
  background:
    radial-gradient(900px 420px at 85% -10%, rgba(8,120,209,.10), transparent 62%),
    radial-gradient(700px 380px at -8% 108%, rgba(112,217,0,.06), transparent 60%),
    radial-gradient(520px 300px at 50% 118%, rgba(255,196,0,.04), transparent 60%),
    linear-gradient(rgba(8,120,209,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(8,120,209,.05) 1px, transparent 1px);
  background-size:100% 100%,100% 100%,100% 100%,44px 44px,44px 44px;
}
body::after{
  content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
  background:repeating-linear-gradient(0deg, rgba(241,244,246,.012) 0 1px, transparent 1px 3px);
}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.wrap{max-width:1180px;margin:0 auto;padding:14px 16px 30px}

/* ---------- верхняя панель ---------- */
.top{
  position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:14px;flex-wrap:wrap;
  padding:10px 16px;border-bottom:1px solid var(--line);
  background:rgba(11,21,30,.92);backdrop-filter:blur(6px);
}
.top::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;
  background:linear-gradient(90deg,transparent,var(--acc) 30%,var(--ok) 60%,transparent);
  opacity:.8;pointer-events:none}
.brand{display:flex;align-items:center;gap:10px}
.brand .bolt{width:30px;height:30px;border-radius:7px;border:1px solid rgba(8,120,209,.45);
  background:rgba(8,120,209,.14);display:flex;align-items:center;justify-content:center;flex:none}
.brand h1{font-family:var(--mono);font-size:17px;font-weight:700;letter-spacing:.04em;line-height:1}
.brand small{display:block;margin-top:3px;font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut)}
.pill{display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:4px;
  font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.12em;border:1px solid}
.led{width:7px;height:7px;border-radius:50%;flex:none;box-shadow:0 0 6px 1px currentColor}
.pulse{animation:led 1.8s ease-in-out infinite}
@keyframes led{0%,100%{opacity:1}50%{opacity:.35}}
.topmeta{margin-left:auto;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.tm{display:flex;flex-direction:column;align-items:flex-start}
.tm b{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);font-weight:600}
.tm span{font-family:var(--mono);font-size:11.5px;color:var(--ink)}

/* ---------- баннер состояния ---------- */
.banner{display:none;align-items:center;gap:12px;margin:12px 0 0;padding:12px 14px;border-radius:8px;border:1px solid}
.banner.show{display:flex}
.banner .bi{font-size:12.5px;font-weight:600}
.banner .bs{font-size:11px;color:var(--mut);margin-top:2px}

/* ---------- сцена энергии ---------- */
.scene{margin-top:14px;border:1px solid var(--line);border-radius:10px;background:linear-gradient(180deg,rgba(16,27,37,.7),rgba(11,21,30,.9));overflow:hidden}
.scene svg{display:block;width:100%;height:auto}
.svg-label{font-family:var(--mono);letter-spacing:.14em;fill:var(--mut);font-size:10px}
.svg-num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.flow{fill:none;stroke-linecap:round;stroke-dasharray:9 13;opacity:0;transition:opacity .4s;
  animation:dash var(--dur,1s) linear infinite}
@keyframes dash{to{stroke-dashoffset:-22}}
.batt-fill{transition:y .8s ease,height .8s ease,fill .5s}
@keyframes sheen{0%{transform:translateY(120%);opacity:0}25%{opacity:.5}100%{transform:translateY(-130%);opacity:0}}
.sheen{animation:sheen 2.4s ease-in-out infinite}
@keyframes ray{to{transform:rotate(360deg)}}
.rays{animation:ray 24s linear infinite;transform-box:fill-box;transform-origin:center}

/* ---------- KPI ---------- */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}
.kpi{position:relative;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:14px 16px 13px;overflow:hidden;
  transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
.kpi:hover{transform:translateY(-2px);border-color:var(--line2);box-shadow:0 8px 26px rgba(0,0,0,.35)}
.kpi::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:2px;opacity:.8}
.kpi.pv::before{background:var(--warn)} .kpi.bat::before{background:var(--ok)}
.kpi.load::before{background:var(--bad)} .kpi.bms::before{background:var(--acc)}
.kpi .lab{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut)}
.kpi .val{font-family:var(--mono);font-size:30px;font-weight:700;line-height:1.15;margin-top:6px}
.kpi .val em{font-style:normal;font-size:12px;color:var(--mut);font-weight:400;margin-left:2px}
.kpi .sub{font-size:10.5px;color:var(--mut);margin-top:4px}
.kpi .calc{position:absolute;right:10px;top:10px;font-size:8px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--mut);border:1px solid var(--line);border-radius:3px;padding:1px 5px}

/* ---------- панели ---------- */
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}
.card{border:1px solid var(--line);border-radius:8px;background:var(--panel);overflow:hidden;
  transition:border-color .18s ease,box-shadow .18s ease}
.card:hover{border-color:var(--line2);box-shadow:0 8px 26px rgba(0,0,0,.3)}
.card h2{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);
  background:rgba(16,27,37,.6);font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(241,244,246,.9)}
.card h2 .dot{width:7px;height:7px;border-radius:2px;flex:none}
.card .body{padding:12px 14px}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid rgba(26,42,53,.6)}
.row:last-child{border-bottom:0}
.row .k{font-size:11px;color:var(--mut)}
.row .v{font-family:var(--mono);font-size:12px;text-align:right}
.chip{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:3px;font-size:9.5px;font-weight:700;letter-spacing:.1em;border:1px solid}
.spark{margin-top:8px}
.spark canvas{width:100%;height:56px;display:block;border:1px solid var(--line);border-radius:5px;background:rgba(5,10,16,.6)}
.spark .cap{display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:var(--mut);letter-spacing:.08em;text-transform:uppercase}

/* ---------- системная полоса ---------- */
.sys{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-top:14px}
.sys .cell{border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:10px 12px}
.sys .cell b{display:block;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);font-weight:600}
.sys .cell span{display:block;font-family:var(--mono);font-size:15px;margin-top:4px}

footer{margin-top:20px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;
  font-size:10px;color:var(--mut)}
footer .num{color:var(--ink)}

/* появление */
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.rev{animation:rise .5s cubic-bezier(.22,.9,.3,1) both}
.d1{animation-delay:.05s}.d2{animation-delay:.1s}.d3{animation-delay:.15s}.d4{animation-delay:.2s}.d5{animation-delay:.25s}

@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.sys{grid-template-columns:repeat(3,1fr)}}
@media(max-width:560px){.sys{grid-template-columns:repeat(2,1fr)}.topmeta{display:none}}
</style>
</head>
<body>

<!-- верхняя панель -->
<div class="top">
  <div class="brand">
    <span class="bolt"><svg width="15" height="15" viewBox="0 0 24 24" fill="var(--acc2)"><path d="M13 2 3 14h7l-1 8 11-13h-7l0-7z"/></svg></span>
    <div><h1>SmartWatt</h1><small>Солнечная + JBD · шлюз ESP32</small></div>
  </div>
  <span class="pill" id="connPill"><span class="led" id="connLed"></span><span id="connTxt">ПОДКЛЮЧЕНИЕ</span></span>
  <div class="topmeta">
    <div class="tm"><b>IP</b><span class="num" id="mIp">—</span></div>
    <div class="tm"><b>Прошивка</b><span class="num" id="mFw">—</span></div>
    <div class="tm"><b>Измерение</b><span class="num" id="mMeas">—</span></div>
    <div class="tm"><b>Возраст</b><span class="num" id="mAge">—</span></div>
    <div class="tm"><b>Аптайм</b><span class="num" id="mUp">—</span></div>
  </div>
</div>

<div class="wrap">

  <!-- баннер отсутствия связи -->
  <div class="banner" id="banner">
    <span id="bannerIco" style="font-size:18px"></span>
    <div><div class="bi" id="bannerTitle"></div><div class="bs" id="bannerSub"></div></div>
  </div>

  <!-- сцена энергии -->
  <div class="scene rev d1">
    <svg viewBox="0 0 900 320" role="img" aria-label="Энергетическая система">
      <defs>
        <radialGradient id="glow"><stop offset="0" stop-color="#FFC400" stop-opacity=".5"/><stop offset="1" stop-color="#FFC400" stop-opacity="0"/></radialGradient>
        <linearGradient id="pan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12283E"/><stop offset="1" stop-color="#0B1B2B"/></linearGradient>
      </defs>

      <!-- солнце + панели (слева) -->
      <g id="sunG" style="transition:opacity .8s">
        <circle id="sunGlow" cx="140" cy="60" r="42" fill="url(#glow)"/>
        <g class="rays" id="sunRays"><g id="rayG"></g></g>
        <circle cx="140" cy="60" r="15" fill="#FFD34D"/>
      </g>
      <g>
        <polygon points="90,175 210,175 194,140 106,140" fill="url(#pan)" stroke="#27404F" id="panelShape"/>
        <line x1="120" y1="140" x2="104" y2="175" stroke="#163450"/><line x1="150" y1="140" x2="140" y2="175" stroke="#163450"/><line x1="180" y1="140" x2="176" y2="175" stroke="#163450"/>
        <line x1="100" y1="152" x2="200" y2="152" stroke="#163450"/><line x1="95" y1="163" x2="205" y2="163" stroke="#163450"/>
        <text x="150" y="128" text-anchor="middle" class="svg-label">СОЛНЕЧНЫЕ ПАНЕЛИ</text>
        <text x="150" y="200" text-anchor="middle" class="svg-num" font-size="21" font-weight="700" id="pvW" fill="#8A969F">—</text>
        <text x="150" y="218" text-anchor="middle" class="svg-num" font-size="10.5" fill="#8A969F" id="pvVA">—</text>
      </g>

      <!-- энергетическая шина (центр) -->
      <g>
        <rect id="busGlow" x="424" y="64" width="26" height="192" rx="13" fill="none" stroke="#0878D1" stroke-width="7" opacity="0"/>
        <rect x="424" y="64" width="26" height="192" rx="13" fill="#101B25" id="busRect" stroke="#27404F"/>
        <text x="437" y="40" text-anchor="middle" class="svg-label">ШИНА</text>
      </g>

      <!-- аккумулятор (под шиной) -->
      <g>
        <rect x="404" y="272" width="66" height="7" rx="2" fill="#27404F"/>
        <rect x="392" y="279" width="90" height="34" rx="5" fill="#101B25" stroke="#27404F" id="battFrame"/>
        <clipPath id="bclip"><rect x="395" y="282" width="84" height="28" rx="3"/></clipPath>
        <g clip-path="url(#bclip)">
          <rect id="battFill" class="batt-fill" x="395" y="310" width="84" height="0" fill="#70D900" opacity=".5"/>
        </g>
        <text x="350" y="300" text-anchor="end" class="svg-label">АКБ</text>
        <text x="500" y="300" class="svg-num" font-size="17" font-weight="700" id="batSoc" fill="#8A969F">—</text>
        <text x="500" y="316" class="svg-num" font-size="10.5" fill="#8A969F" id="batVA">—</text>
      </g>

      <!-- нагрузка (справа) -->
      <g>
        <rect x="700" y="120" width="150" height="80" rx="7" fill="#101B25" stroke="#27404F" id="loadFrame"/>
        <circle cx="726" cy="160" r="12" fill="none" stroke="#27404F" stroke-width="2" id="loadRing"/>
        <circle cx="726" cy="160" r="4" fill="#27404F" id="loadDot"/>
        <text x="780" y="152" text-anchor="middle" class="svg-num" font-size="20" font-weight="700" id="loadW" fill="#8A969F">—</text>
        <text x="780" y="170" text-anchor="middle" class="svg-num" font-size="9" fill="#8A969F">РАСЧЁТНАЯ · PV − АКБ</text>
        <text x="775" y="222" text-anchor="middle" class="svg-label">НАГРУЗКА</text>
      </g>

      <!-- потоки (только реальные мощности) -->
      <path class="flow" id="fPv"   d="M 216 160 L 420 160" stroke="#FFC400"/>
      <path class="flow" id="fChg"  d="M 437 186 L 437 268" stroke="#70D900"/>
      <path class="flow" id="fDis"  d="M 437 268 L 437 186" stroke="#FF3D32"/>
      <path class="flow" id="fLoad" d="M 454 160 L 696 160" stroke="#FF3D32"/>
      <text x="318" y="148" text-anchor="middle" class="svg-num" font-size="10.5" id="fPvT" fill="#8A969F">PV —</text>
      <text x="392" y="232" text-anchor="end" class="svg-num" font-size="10.5" id="fBatT" fill="#8A969F">АКБ —</text>
      <text x="575" y="148" text-anchor="middle" class="svg-num" font-size="10.5" id="fLoadT" fill="#8A969F">—</text>
    </svg>
  </div>

  <!-- KPI -->
  <div class="kpis">
    <div class="kpi pv rev d2"><div class="lab">Солнечная генерация</div><div class="val" id="kPv">—<em>W</em></div><div class="sub" id="kPvSub">—</div></div>
    <div class="kpi bat rev d3"><div class="lab">Аккумулятор</div><div class="val" id="kBat">—<em>W</em></div><div class="sub" id="kBatSub">—</div></div>
    <div class="kpi load rev d4"><span class="calc">расчёт</span><div class="lab">Расчётная нагрузка</div><div class="val" id="kLoad">—<em>W</em></div><div class="sub">max(0, PV − BMS)</div></div>
    <div class="kpi bms rev d5"><div class="lab">BMS · JBD</div><div class="val" id="kBmsSoc">—<em>%</em></div><div class="sub" id="kBmsSub">—</div></div>
  </div>

  <!-- панели -->
  <div class="grid">
    <div class="card rev d3">
      <h2><span class="dot" style="background:var(--warn)"></span>Солнечная генерация</h2>
      <div class="body">
        <div class="row"><span class="k">Мощность PV</span><span class="v" id="pPower">—</span></div>
        <div class="row"><span class="k">Напряжение</span><span class="v" id="pVolt">—</span></div>
        <div class="row"><span class="k">Ток</span><span class="v" id="pCur">—</span></div>
        <div class="row"><span class="k">Мощность заряда</span><span class="v" id="pCharge">—</span></div>
        <div class="row"><span class="k">Режим</span><span class="v" id="pMode">—</span></div>
        <div class="row"><span class="k">Макс. ток заряда</span><span class="v" id="pMaxC">—</span></div>
        <div class="row"><span class="k">Макс. мощность заряда</span><span class="v" id="pMaxP">—</span></div>
        <div class="spark"><canvas id="spark"></canvas>
          <div class="cap"><span>Производство PV · реальные samples</span><span class="num" id="sparkN">0</span></div>
        </div>
      </div>
    </div>

    <div class="card rev d4">
      <h2><span class="dot" style="background:var(--ok)"></span>Аккумулятор</h2>
      <div class="body">
        <div class="row"><span class="k">Заряд (SOC)</span><span class="v" id="bSoc">—</span></div>
        <div class="row"><span class="k">Напряжение</span><span class="v" id="bVolt">—</span></div>
        <div class="row"><span class="k">Ток</span><span class="v" id="bCur">—</span></div>
        <div class="row"><span class="k">Мощность (BMS)</span><span class="v" id="bPow">—</span></div>
        <div class="row"><span class="k">Температура</span><span class="v" id="bTemp">—</span></div>
        <div class="row"><span class="k">Остаточная ёмкость</span><span class="v" id="bRem">—</span></div>
        <div class="row"><span class="k">Полная ёмкость</span><span class="v" id="bFull">—</span></div>
      </div>
    </div>

    <div class="card rev d5">
      <h2><span class="dot" style="background:var(--bad)"></span>BMS · состояние</h2>
      <div class="body">
        <div class="row"><span class="k">BMS</span><span class="v" id="sBms">—</span></div>
        <div class="row"><span class="k">Циклы</span><span class="v" id="sCycles">—</span></div>
        <div class="row"><span class="k">Мин. ячейка</span><span class="v" id="sMinC">—</span></div>
        <div class="row"><span class="k">Макс. ячейка</span><span class="v" id="sMaxC">—</span></div>
        <div class="row"><span class="k">Разбаланс</span><span class="v" id="sDelta">—</span></div>
        <div class="row"><span class="k">Защита</span><span class="v" id="sProt">—</span></div>
        <div class="row"><span class="k">Зарядный FET</span><span class="v" id="sFetC">—</span></div>
        <div class="row"><span class="k">Разрядный FET</span><span class="v" id="sFetD">—</span></div>
        <div class="row"><span class="k">Балансировка</span><span class="v" id="sBal">—</span></div>
        <div class="row"><span class="k">Неисправность</span><span class="v" id="sFault">—</span></div>
      </div>
    </div>
  </div>

  <!-- системная полоса -->
  <div class="sys">
    <div class="cell rev d3"><b>Ошибки Modbus</b><span id="xMbe">—</span></div>
    <div class="cell rev d3"><b>Повторы Modbus</b><span id="xMbr">—</span></div>
    <div class="cell rev d4"><b>Запросы JBD</b><span id="xJrq">—</span></div>
    <div class="cell rev d4"><b>Ошибки JBD</b><span id="xJer">—</span></div>
    <div class="cell rev d5"><b>Тайм-ауты JBD</b><span id="xJto">—</span></div>
    <div class="cell rev d5"><b>RSSI Wi-Fi</b><span id="xRssi">—</span></div>
  </div>

  <footer>
    <span>Встроенный интерфейс шлюза · данные: <span class="num" id="fSrc">/api/data</span> · WebSocket <span class="num" id="fWs">:81</span></span>
    <span>Последнее обновление: <span class="num" id="fUpd">—</span></span>
  </footer>
</div>

<script>
"use strict";
/* ===== только реальные данные; null/NaN -> "—" ===== */
function num(v){ if(typeof v==="number"&&isFinite(v))return v;
  if(typeof v==="string"&&v.trim()!==""){var n=Number(v);if(isFinite(n))return n;} return null; }
function fmt(v,d){ d=(d===undefined)?1:d; var n=num(v);
  return n===null?"—":n.toLocaleString("ru-RU",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function unit(v,d,u){ var s=fmt(v,d); return s==="—"?"—":s+" "+u; }
function sgn(v,d,u){ var n=num(v); if(n===null)return"—";
  return (n>0?"+":"")+n.toLocaleString("ru-RU",{minimumFractionDigits:d,maximumFractionDigits:d})+" "+u; }
function tstr(ms){ if(ms===null)return"—"; var d=new Date(ms),p=function(x){return (x<10?"0":"")+x};
  return p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds()); }
function agoStr(ms){ var n=num(ms); if(n===null)return"—";
  if(n<1000)return Math.round(n)+" мс"; if(n<60000)return (n/1000).toLocaleString("ru-RU",{maximumFractionDigits:1})+" с";
  return Math.floor(n/60000)+" мин"; }
function upStr(ms){ var n=num(ms); if(n===null)return"—"; var s=Math.floor(n/1000);
  if(s<60)return s+" с"; var m=Math.floor(s/60); if(m<60)return m+" м"; var h=Math.floor(m/60);
  if(h<24)return h+" ч "+(m%60)+" м"; return Math.floor(h/24)+" д "+(h%24)+" ч"; }
function yn(v){ var b=(typeof v==="boolean")?v:(typeof v==="number"?v!==0:null);
  return b===null?"—":(b?"ВКЛ":"ВЫКЛ"); }

var $=function(id){return document.getElementById(id);};
var state={data:null,recv:null,lastTs:null,fails:0,ever:false,ws:false,spark:[],lastSparkTs:null};

/* ===== состояние соединения ===== */
var STALE=30000;
function connNow(){
  var now=Date.now();
  if(!state.ever) return state.fails>=3?"offline":"connecting";
  var age=null;
  if(state.data&&num(state.data.dataAgeMs)!==null) age=num(state.data.dataAgeMs);
  else if(state.recv) age=now-state.recv;
  if(age!==null&&age>STALE) return "stale";
  if(state.fails>=3&&!state.ws) return "offline";
  return "online";
}
function paintConn(){
  var c=connNow(),pill=$("connPill"),led=$("connLed"),txt=$("connTxt");
  var map={
    online:["В СЕТИ","#70D900",true],
    stale:["ДАННЫЕ УСТАРЕЛИ","#FFC400",true],
    connecting:["ПОДКЛЮЧЕНИЕ","#0878D1",true],
    offline:["НЕТ СВЯЗИ","#FF3D32",false]
  };
  var m=map[c];
  pill.style.color=m[1]; pill.style.borderColor=m[1]+"55"; pill.style.background=m[1]+"14";
  led.style.background=m[1]; led.style.color=m[1];
  led.className="led"+(m[2]?" pulse":"");
  txt.textContent=m[0];

  var ban=$("banner");
  if(c==="offline"&&!state.ever){
    ban.className="banner show"; ban.style.borderColor="#FF3D3255"; ban.style.background="#FF3D320D";
    $("bannerIco").textContent="⚠"; $("bannerTitle").textContent="НЕТ СВЯЗИ С GATEWAY";
    $("bannerSub").textContent="ESP32 недоступен. Идёт опрос HTTP API и переподключение WebSocket (порт 81).";
  }else if((c==="offline"||c==="stale")&&state.ever){
    ban.className="banner show"; ban.style.borderColor="#FFC40044"; ban.style.background="#FFC4000A";
    $("bannerIco").textContent="⏱"; $("bannerTitle").textContent=(c==="offline"?"СВЯЗЬ ПОТЕРЯНА":"ДАННЫЕ УСТАРЕЛИ");
    $("bannerSub").textContent="Показаны последние известные значения — они отмечены как УСТАРЕЛО.";
  }else{ ban.className="banner"; }
}

/* ===== потоки на сцене (интенсивность от реальной мощности) ===== */
function flow(id,watts){
  var el=$(id),on=watts!==null&&watts>0;
  el.style.opacity=on?"1":"0";
  if(on){
    el.style.strokeWidth=(1.6+Math.min(5.4,watts/55)).toFixed(1);
    el.style.setProperty("--dur",Math.max(0.4,Math.min(2.4,2.3-watts/150)).toFixed(2)+"s");
  }
}
function setTxt(id,t){ $(id).textContent=t; }

/* ===== главный рендер ===== */
function render(){
  var d=state.data; if(!d) return;
  var stale=connNow()!=="online";
  var pv=num(d.pvPower), batt=num(d.bmsPower), load=num(d.loadPower), soc=num(d.batterySOC);
  if(soc===null) soc=num(d.bmsSOC);
  var charging=batt!==null&&batt>0, discharging=batt!==null&&batt<0;

  /* KPI */
  $("kPv").innerHTML=fmt(pv,0)+"<em>W</em>";
  $("kPvSub").textContent=fmt(d.pvVoltage,1)+" V · "+fmt(d.pvCurrent,2)+" A";
  $("kBat").innerHTML=(batt===null?"—":(batt>0?"+":"")+fmt(batt,0))+"<em>W</em>";
  $("kBatSub").textContent=batt===null?"Нет данных":(charging?"Заряд":(discharging?"Разряд":"0 W"));
  $("kLoad").innerHTML=fmt(load,0)+"<em>W</em>";
  var bsoc=num(d.bmsSOC);
  $("kBmsSoc").innerHTML=fmt(bsoc,0)+"<em>%</em>";
  $("kBmsSub").textContent=(d.bmsOnline?"В СЕТИ":"НЕТ СВЯЗИ")+" · "+fmt(d.bmsCycles,0)+" циклов";

  /* сцена */
  setTxt("pvW", pv===null?"—":fmt(pv,0)+" W");
  $("pvW").setAttribute("fill", pv>0?"#FFC400":"#8A969F");
  setTxt("pvVA", fmt(d.pvVoltage,1)+" V · "+fmt(d.pvCurrent,2)+" A");
  setTxt("batSoc", soc===null?"—":fmt(soc,0)+"%");
  $("batSoc").setAttribute("fill", soc===null?"#8A969F":(charging?"#70D900":(soc<20?"#FF3D32":(soc<45?"#FFC400":"#70D900"))));
  setTxt("batVA", fmt(d.batteryVoltage,2)+" V · "+fmt(d.batteryCurrent,2)+" A");
  setTxt("loadW", load===null?"—":fmt(load,0)+" W");
  $("loadW").setAttribute("fill", load>0?"#FF3D32":"#8A969F");
  $("loadRing").setAttribute("stroke", load>0?"#FF3D32":"#27404F");
  $("loadDot").setAttribute("fill", load>0?"#FF3D32":"#27404F");
  $("panelShape").setAttribute("stroke", pv>0?"#FFC40088":"#27404F");
  $("sunG").style.opacity=(pv>0)?"1":"0.35";
  $("busRect").setAttribute("stroke",(pv>0||charging||discharging||load>0)?"#0878D199":"#27404F");
  $("busGlow").setAttribute("opacity",(pv>0||charging||discharging||load>0)?"0.16":"0");

  /* заполнение АКБ */
  var fill=$("battFill"), h=soc===null?0:Math.min(100,Math.max(0,soc));
  var hh=28*h/100;
  fill.setAttribute("y",(310-hh).toFixed(1)); fill.setAttribute("height",hh.toFixed(1));
  fill.setAttribute("fill", charging?"#70D900":(soc!==null&&soc<20?"#FF3D32":(soc!==null&&soc<45?"#FFC400":"#70D900")));
  fill.setAttribute("opacity", soc===null?"0":"0.5");

  /* потоки: PV->шина, шина<->АКБ, шина->нагрузка */
  flow("fPv", pv>0?pv:null);
  flow("fChg", charging?batt:null);
  flow("fDis", discharging?Math.abs(batt):null);
  flow("fLoad", load>0?load:null);
  setTxt("fPvT", pv===null?"PV —":"PV "+fmt(pv,0)+" W");
  $("fPvT").setAttribute("fill", pv>0?"#FFC400":"#8A969F");
  setTxt("fBatT", batt===null?"АКБ —":(charging?"заряд +"+fmt(batt,0)+" W":"разряд "+fmt(batt,0)+" W"));
  $("fBatT").setAttribute("fill", batt===null?"#8A969F":(charging?"#70D900":"#FF3D32"));
  setTxt("fLoadT", load===null?"—":fmt(load,0)+" W");
  $("fLoadT").setAttribute("fill", load>0?"#FF3D32":"#8A969F");

  /* панель PV */
  setTxt("pPower", unit(d.pvPower,1,"W"));
  setTxt("pVolt", unit(d.pvVoltage,2,"V"));
  setTxt("pCur", unit(d.pvCurrent,2,"A"));
  setTxt("pCharge", unit(d.chargePower,1,"W"));
  setTxt("pMode", d.chargeState||"—");
  setTxt("pMaxC", unit(d.maxChargeCurrent,2,"A"));
  setTxt("pMaxP", unit(d.maxChargePower,0,"W"));

  /* панель АКБ */
  setTxt("bSoc", unit(soc,1,"%"));
  setTxt("bVolt", unit(d.batteryVoltage,2,"V"));
  setTxt("bCur", sgn(d.batteryCurrent,2,"A"));
  setTxt("bPow", sgn(batt,1,"W"));
  setTxt("bTemp", unit(d.batteryTemp,1,"°C"));
  setTxt("bRem", unit(d.bmsRemainingAh,1,"Ah"));
  setTxt("bFull", unit(d.bmsFullCapacityAh,1,"Ah"));

  /* панель BMS */
  setTxt("sBms", d.bmsOnline?"В СЕТИ":"НЕТ СВЯЗИ");
  $("sBms").style.color=d.bmsOnline?"#70D900":"#FF3D32";
  setTxt("sCycles", fmt(d.bmsCycles,0));
  setTxt("sMinC", unit(d.bmsMinCellVoltage,3,"V"));
  setTxt("sMaxC", unit(d.bmsMaxCellVoltage,3,"V"));
  var dv=num(d.bmsDeltaCellVoltage);
  setTxt("sDelta", dv===null?"—":fmt(dv*1000,0)+" mV");
  var prot=d.bmsProtectionText;
  setTxt("sProt", (num(d.bmsProtection)===0)?"Нет защиты":(prot||"—"));
  setTxt("sFetC", yn(d.bmsChargeFet));
  setTxt("sFetD", yn(d.bmsDischargeFet));
  setTxt("sBal", yn(d.bmsBalancing));
  setTxt("sFault", d.fault?((d.faultDescription)||"Авария"):"Нет");

  /* верхняя панель */
  setTxt("mIp", d.ip||"—");
  var meas=num(d.timestamp);
  setTxt("mMeas", tstr(meas));
  var age=num(d.dataAgeMs); if(age===null&&state.recv) age=Date.now()-state.recv;
  setTxt("mAge", agoStr(age));
  $("mAge").style.color=(age!==null&&age>10000)?"#FFC400":"";
  setTxt("fUpd", tstr(state.recv));

  /* спарклайн */
  if(meas!==null&&meas!==state.lastSparkTs&&pv!==null){
    state.lastSparkTs=meas;
    state.spark.push({ts:meas,v:pv});
    if(state.spark.length>160)state.spark.shift();
    drawSpark();
  }
}

/* ===== спарклайн: только реальные samples ===== */
function drawSpark(){
  var c=$("spark"); if(!c.getContext)return;
  var dpr=window.devicePixelRatio||1, w=c.clientWidth,h=56;
  c.width=w*dpr; c.height=h*dpr;
  var g=c.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
  $("sparkN").textContent=state.spark.length;
  if(state.spark.length<2){
    g.fillStyle="#8A969F"; g.font="10px monospace"; g.fillText("Недостаточно данных",8,32); return;
  }
  var arr=state.spark, mn=Infinity,mx=-Infinity;
  for(var i=0;i<arr.length;i++){ if(arr[i].v<mn)mn=arr[i].v; if(arr[i].v>mx)mx=arr[i].v; }
  if(mx===mn)mx=mn+1;
  g.beginPath();
  for(var j=0;j<arr.length;j++){
    var x=j/(arr.length-1)*(w-8)+4, y=h-6-(arr[j].v-mn)/(mx-mn)*(h-14);
    if(j===0)g.moveTo(x,y); else g.lineTo(x,y);
  }
  g.strokeStyle="#FFC400"; g.lineWidth=1.6; g.stroke();
  g.lineTo(w-4,h-2); g.lineTo(4,h-2); g.closePath();
  g.fillStyle="rgba(255,196,0,.08)"; g.fill();
}

/* ===== применение фрейма (дедупликация по timestamp) ===== */
function applyFrame(f,fromWs){
  if(!f||typeof f!=="object")return;
  var ts=num(f.timestamp);
  if(fromWs&&ts!==null&&ts===state.lastTs&&state.data)return; /* тот же sample */
  state.data=f; state.recv=Date.now(); state.fails=0; state.ever=true;
  render();
}

/* ===== HTTP-поллинг (фолбэк) ===== */
function fetchData(){
  fetch("/api/data",{cache:"no-store"}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status); return r.json();
  }).then(function(j){ applyFrame(j,false); })
  .catch(function(){ state.fails++; });
}
function fetchStatus(){
  fetch("/api/status",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;})
  .then(function(s){ if(!s)return;
    setTxt("mUp", upStr(num(s.uptime_ms)));
    setTxt("xMbe", fmt(num(s.modbus_errors),0));
    setTxt("xMbr", fmt(num(s.modbus_retries),0));
    setTxt("xJrq", fmt(num(s.bms_requests),0));
    setTxt("xJer", fmt(num(s.bms_errors),0));
    setTxt("xRssi", num(s.rssi)===null?"—":fmt(num(s.rssi),0)+" dBm");
  }).catch(function(){});
}
function fetchVersion(){
  fetch("/api/version",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;})
  .then(function(v){ if(v&&v.version) setTxt("mFw","v"+v.version); }).catch(function(){});
}
function fetchBmsDiag(){
  fetch("/api/bms",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;})
  .then(function(b){ if(!b||!b.diagnostics)return;
    setTxt("xJto", fmt(num(b.diagnostics.timeouts),0));
  }).catch(function(){});
}

/* ===== WebSocket :81 + reconnect ===== */
var wsTry=0;
function connectWs(){
  var ws;
  try{ ws=new WebSocket("ws://"+location.hostname+":81"); }catch(e){ schedWs(); return; }
  ws.onopen=function(){ state.ws=true; wsTry=0; $("fWs").textContent=":81 · открыт"; };
  ws.onmessage=function(e){ try{ applyFrame(JSON.parse(e.data),true);}catch(_){ } };
  ws.onclose=function(){ state.ws=false; $("fWs").textContent=":81 · закрыт"; schedWs(); };
  ws.onerror=function(){ try{ws.close();}catch(_){ } };
}
function schedWs(){ var d=Math.min(1000*Math.pow(2,wsTry),10000); wsTry++; setTimeout(connectWs,d); }

/* ===== лучи солнца (декоративные, детерминированные) ===== */
(function(){
  var g=$("rayG"); if(!g)return;
  for(var i=0;i<10;i++){
    var a=i*Math.PI/5, l=document.createElementNS("http://www.w3.org/2000/svg","line");
    l.setAttribute("x1",140+Math.cos(a)*22); l.setAttribute("y1",60+Math.sin(a)*22);
    l.setAttribute("x2",140+Math.cos(a)*30); l.setAttribute("y2",60+Math.sin(a)*30);
    l.setAttribute("stroke","#FFC400"); l.setAttribute("stroke-width","2");
    l.setAttribute("stroke-linecap","round"); l.setAttribute("opacity","0.7");
    g.appendChild(l);
  }
})();

/* ===== старт ===== */
fetchData(); fetchStatus(); fetchVersion(); fetchBmsDiag();
connectWs();
setInterval(fetchData,5000);
setInterval(fetchStatus,10000);
setInterval(fetchBmsDiag,15000);
setInterval(function(){ paintConn(); },1000);
paintConn();
</script>
</body>
</html>)SMARTWATT_UI";
