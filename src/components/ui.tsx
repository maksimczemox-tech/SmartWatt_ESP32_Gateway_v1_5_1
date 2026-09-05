import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Loader2, type LucideIcon } from "lucide-react";
import { useData } from "../store/DataContext";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";
import { DASH, copyText, fmt, isMissing } from "../utils/format";
import type { ConnectionStatus, SubsystemState } from "../types";

/* ---------------- Card ---------------- */

export function Card({
  title,
  icon,
  right,
  children,
  className,
  bodyClassName,
  delay = 0,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  delay?: number;
}) {
  return (
    <section
      className={`reveal card-hover bg-panel border border-line rounded-lg overflow-hidden ${className ?? ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title !== undefined && (
        <header className="flex items-center justify-between gap-2 px-3.5 h-9 border-b border-line/70 bg-panel2/40">
          <div className="flex items-center gap-1.5 text-mut min-w-0">
            {icon}
            <h2 className="text-[10px] font-semibold tracking-[0.16em] uppercase truncate">{title}</h2>
          </div>
          {right}
        </header>
      )}
      <div className={`p-3.5 ${bodyClassName ?? ""}`}>{children}</div>
    </section>
  );
}

/* ---------------- LED / chips ---------------- */

export function Led({
  color,
  pulse = false,
  className,
}: {
  color: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${pulse ? "led" : "led-static"} ${className ?? ""}`}
      style={{ backgroundColor: color, color }}
    />
  );
}

const CONN_META: Record<ConnectionStatus, { label: string; color: string }> = {
  ONLINE: { label: "ONLINE", color: "#70D900" },
  OFFLINE: { label: "OFFLINE", color: "#FF3D32" },
  CONNECTING: { label: "CONNECTING", color: "#0878D1" },
  RECONNECTING: { label: "RECONNECTING", color: "#FFC400" },
  STALE: { label: "STALE", color: "#FFC400" },
};

export function StatusPill({ status, compact }: { status: ConnectionStatus; compact?: boolean }) {
  const m = CONN_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded px-2 py-[3px] ${compact ? "text-[10px]" : "text-[11px]"} font-semibold tracking-[0.1em]`}
      style={{ color: m.color, borderColor: `${m.color}55`, backgroundColor: `${m.color}12` }}
    >
      <Led color={m.color} pulse={status === "ONLINE" || status === "RECONNECTING" || status === "CONNECTING"} />
      {m.label}
    </span>
  );
}

export function SubsystemChip({ state }: { state: SubsystemState }) {
  const map: Record<SubsystemState, { label: string; color: string }> = {
    ONLINE: { label: "ONLINE", color: "#70D900" },
    OFFLINE: { label: "OFFLINE", color: "#FF3D32" },
    NO_DATA: { label: "НЕТ ДАННЫХ", color: "#8A969F" },
  };
  const m = map[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.1em]"
      style={{ color: m.color }}
    >
      <Led color={m.color} pulse={state === "ONLINE"} />
      {m.label}
    </span>
  );
}

export function OnOffChip({ value }: { value: "ON" | "OFF" | null }) {
  if (value === null) {
    return <span className="text-[11px] font-semibold text-mut">{DASH}</span>;
  }
  const on = value === "ON";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-[2px] text-[10px] font-bold tracking-[0.12em] border"
      style={{
        color: on ? "#70D900" : "#8A969F",
        borderColor: on ? "#70D90055" : "#1A2A35",
        backgroundColor: on ? "#70D90014" : "transparent",
      }}
    >
      <Led color={on ? "#70D900" : "#8A969F"} pulse={on} />
      {value}
    </span>
  );
}

/* ---------------- Metric ---------------- */

const TONES: Record<string, string> = {
  ink: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  acc: "text-acc2",
  mut: "text-mut",
};

export function Metric({
  label,
  value,
  digits = 1,
  unitStr,
  sign = false,
  text,
  sub,
  tone = "ink",
  size = "md",
  source,
  className,
}: {
  label: string;
  /** Сырое число от Gateway (может быть null/undefined). */
  value?: unknown;
  digits?: number;
  unitStr?: string;
  sign?: boolean;
  /** Строковое значение (вместо числа). */
  text?: string;
  sub?: ReactNode;
  tone?: keyof typeof TONES;
  size?: "sm" | "md" | "lg";
  /** Прозрачность источника: "/api/data · batteryVoltage". */
  source?: string;
  className?: string;
}) {
  const { showSources } = useData();
  const animated = useAnimatedNumber(text !== undefined ? null : value);
  const missing = text !== undefined ? isMissing(text) || text === DASH : animated === null;
  const sizeCls =
    size === "lg" ? "text-[27px] leading-8" : size === "sm" ? "text-[16px] leading-6" : "text-[21px] leading-7";

  let body: string;
  if (text !== undefined) {
    body = text === "" ? DASH : text;
  } else {
    const n = animated;
    if (n === null) body = DASH;
    else body = `${sign && n > 0 ? "+" : ""}${n.toFixed(digits)}`;
  }

  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-mut mb-0.5 truncate">{label}</div>
      <div
        className={`num font-semibold ${sizeCls} ${missing ? "text-mut/70" : TONES[tone]}`}
        title={text !== undefined ? text : undefined}
      >
        {body}
        {!missing && unitStr && <span className="text-[12px] font-medium text-mut ml-1">{unitStr}</span>}
      </div>
      {sub && <div className="text-[11px] text-mut mt-0.5 truncate">{sub}</div>}
      {showSources && source && (
        <div className="num text-[9px] text-acc2/80 mt-1 truncate border border-line rounded px-1 py-px inline-block max-w-full">
          {source}
        </div>
      )}
    </div>
  );
}

/** Форматированное значение без анимации (для плотных списков). */
export function StaticValue({ v, digits, unitStr, className }: { v: unknown; digits?: number; unitStr?: string; className?: string }) {
  const s = fmt(v, digits ?? 1);
  return (
    <span className={`num ${s === DASH ? "text-mut/70" : "text-ink"} ${className ?? ""}`}>
      {s}
      {s !== DASH && unitStr ? <span className="text-mut text-[11px] ml-1">{unitStr}</span> : null}
    </span>
  );
}

/* ---------------- KV row ---------------- */

export function KV({ k, children, mono = true }: { k: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[5px] border-b border-line/50 last:border-0">
      <span className="text-[11px] text-mut shrink-0">{k}</span>
      <span className={`text-[12px] text-ink text-right min-w-0 truncate ${mono ? "num" : ""}`}>{children}</span>
    </div>
  );
}

/* ---------------- EmptyState ---------------- */

export function EmptyState({
  icon: Icon = AlertTriangle,
  title,
  hint,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-5" : "py-10"}`}>
      <Icon size={compact ? 18 : 26} className="text-mut/60 mb-2" strokeWidth={1.6} />
      <div className={`font-semibold text-mut ${compact ? "text-[12px]" : "text-[13px]"} tracking-wide uppercase`}>
        {title}
      </div>
      {hint && <div className="text-[11px] text-mut/70 mt-1 max-w-[300px]">{hint}</div>}
    </div>
  );
}

/* ---------------- Buttons ---------------- */

export function Btn({
  children,
  onClick,
  tone = "ghost",
  busy,
  disabled,
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "primary" | "danger" | "ghost";
  busy?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed";
  const tones = {
    primary: "bg-acc border-acc text-white hover:bg-acc2 hover:border-acc2",
    danger: "bg-bad/10 border-bad/60 text-bad hover:bg-bad hover:text-white",
    ghost: "bg-panel2 border-line text-mut hover:text-ink hover:border-line2",
  } as const;
  return (
    <button
      type="button"
      title={title}
      className={`${base} ${tones[tone]} ${className ?? ""}`}
      onClick={onClick}
      disabled={disabled || busy}
    >
      {busy && <Loader2 size={12} className="spin" />}
      {children}
    </button>
  );
}

export function IconBtn({
  onClick,
  title,
  children,
  busy,
}: {
  onClick?: () => void;
  title: string;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex items-center justify-center w-6 h-6 rounded border border-line text-mut hover:text-ink hover:border-line2 transition-colors"
    >
      {busy ? <Loader2 size={12} className="spin" /> : children}
    </button>
  );
}

/* ---------------- Copy ---------------- */

export function CopyBtn({ getText, label }: { getText: () => string; label?: string }) {
  const [ok, setOk] = useState(false);
  const timerRef = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  return (
    <Btn
      tone="ghost"
      onClick={() => {
        void copyText(getText()).then((r) => {
          if (r) {
            setOk(true);
            window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => setOk(false), 1400);
          }
        });
      }}
    >
      {ok ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
      {label ?? "Copy"}
    </Btn>
  );
}

/* ---------------- JsonViewer ---------------- */

export function JsonViewer({ data, maxH = 260 }: { data: unknown; maxH?: number }) {
  const text = (() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  })();
  return (
    <div>
      <div className="flex justify-end mb-1.5">
        <CopyBtn getText={() => text} label="Copy JSON" />
      </div>
      <pre
        className="hexblock bg-bg border border-line rounded p-2.5 text-mut overflow-auto"
        style={{ maxHeight: maxH }}
      >
        {text}
      </pre>
    </div>
  );
}

/* ---------------- ConfirmDialog ---------------- */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "danger",
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-bg/80" onClick={busy ? undefined : onCancel} />
      <div className="relative bg-panel border border-line2 rounded-lg w-full max-w-sm shadow-2xl page-anim">
        <div className="px-4 pt-4 pb-3 border-b border-line">
          <div className="font-display font-semibold text-[15px] tracking-wide">{title}</div>
        </div>
        <div className="px-4 py-3.5 text-[12.5px] text-mut leading-relaxed">{body}</div>
        <div className="px-4 pb-4 flex justify-end gap-2">
          <Btn tone="ghost" onClick={onCancel} disabled={busy}>
            Отмена
          </Btn>
          <Btn tone={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}
