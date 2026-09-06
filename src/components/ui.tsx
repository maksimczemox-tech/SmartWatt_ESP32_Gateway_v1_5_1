import {
  useEffect,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from "react";
import { Check, Copy, Loader2, AlertTriangle, type LucideIcon } from "lucide-react";
import { copyText, fmt, signed, str, unit } from "../utils/format";
import { useData } from "../store/DataContext";
import type { ConnectionStatus, SubsystemState } from "../types";

/* ---------------- Card ---------------- */

export function Card({
  title,
  icon,
  right,
  children,
  className = "",
  bodyClassName = "p-3.5",
  delay = 0,
}: {
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  delay?: number;
}) {
  return (
    <section
      className={`reveal rounded-lg border border-line bg-panel overflow-hidden ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {title && (
        <header className="flex items-center gap-2 px-3.5 py-2.5 border-b border-line bg-panel2/60">
          {icon && <span className="text-acc2 [&>svg]:block">{icon}</span>}
          <h2 className="font-display font-semibold text-[12px] tracking-[0.14em] uppercase text-ink/90">
            {title}
          </h2>
          <div className="ml-auto flex items-center gap-2 min-w-0">{right}</div>
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ---------------- Metric ----------------
 * Отображает ТОЧНО последнее значение от ESP32.
 * Числовая интерполяция телеметрии запрещена: никаких промежуточных значений.
 */
export function Metric({
  label,
  value,
  digits = 1,
  unitStr,
  sign = false,
  tone = "default",
  size = "md",
  className = "",
  source,
  valueText,
  sub,
}: {
  label: string;
  value?: unknown;
  digits?: number;
  unitStr?: string;
  sign?: boolean;
  tone?: "default" | "ok" | "warn" | "bad" | "acc";
  size?: "md" | "lg";
  className?: string;
  source?: string;
  valueText?: string;
  sub?: ReactNode;
}) {
  const { showSources } = useData();
  const toneCls =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : tone === "acc"
            ? "text-acc2"
            : "text-ink";
  const display =
    valueText ??
    (sign && unitStr
      ? signed(value, digits, unitStr)
      : unitStr
        ? unit(value, digits, unitStr)
        : fmt(value, digits));
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-mut mb-0.5">{label}</div>
      <div className={`num font-semibold leading-tight ${size === "lg" ? "text-[26px]" : "text-[19px]"} ${toneCls}`}>
        {display}
      </div>
      {sub && <div className="text-[11px] text-mut mt-0.5">{sub}</div>}
      {showSources && source && <SourceTag source={source} />}
    </div>
  );
}

/** Инженерный режим: откуда пришло значение (endpoint + поле). */
export function SourceTag({ source }: { source: string }) {
  return (
    <div className="mt-1 inline-flex items-center gap-1 rounded-sm border border-line bg-bg px-1.5 py-[2px] text-[9px] text-mut font-mono">
      <span className="text-acc2">источник:</span> {source}
    </div>
  );
}

/* ---------------- статусы ---------------- */

const STATUS_META: Record<ConnectionStatus, { label: string; color: string; pulse: boolean }> = {
  ONLINE: { label: "В СЕТИ", color: "#70D900", pulse: true },
  OFFLINE: { label: "НЕТ СВЯЗИ", color: "#FF3D32", pulse: false },
  CONNECTING: { label: "ПОДКЛЮЧЕНИЕ", color: "#0878D1", pulse: true },
  RECONNECTING: { label: "ВОССТАНОВЛЕНИЕ СВЯЗИ", color: "#0878D1", pulse: true },
  STALE: { label: "ДАННЫЕ УСТАРЕЛИ", color: "#FFC400", pulse: true },
};

export function StatusPill({ status, compact = false }: { status: ConnectionStatus; compact?: boolean }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm border px-2 py-[3px] font-semibold"
      style={{
        color: m.color,
        borderColor: `${m.color}55`,
        backgroundColor: `${m.color}14`,
        fontSize: compact ? 10 : 11,
        letterSpacing: "0.12em",
      }}
    >
      <Led color={m.color} pulse={m.pulse} />
      {m.label}
    </span>
  );
}

const SUBSYS_META: Record<SubsystemState, { label: string; color: string }> = {
  ONLINE: { label: "В СЕТИ", color: "#70D900" },
  OFFLINE: { label: "НЕТ СВЯЗИ", color: "#FF3D32" },
  STALE: { label: "ДАННЫЕ УСТАРЕЛИ", color: "#FFC400" },
  NO_DATA: { label: "НЕТ ДАННЫХ", color: "#8A969F" },
};

export function SubsystemChip({ state }: { state: SubsystemState }) {
  const m = SUBSYS_META[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-[2px] text-[9.5px] font-semibold tracking-[0.1em]"
      style={{ color: m.color, borderColor: `${m.color}50`, backgroundColor: `${m.color}10` }}
    >
      <Led color={m.color} pulse={state === "ONLINE"} />
      {m.label}
    </span>
  );
}

export function Led({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${pulse ? "led" : "led-static"}`}
      style={{ backgroundColor: color, color }}
    />
  );
}

export function OnOffChip({ value }: { value: "ON" | "OFF" | null }) {
  if (value === null)
    return <span className="text-[10.5px] font-semibold tracking-[0.1em] text-mut">—</span>;
  const on = value === "ON";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-[2px] text-[10px] font-semibold tracking-[0.1em]"
      style={{
        color: on ? "#70D900" : "#8A969F",
        borderColor: on ? "#70D90055" : "#1A2A35",
        backgroundColor: on ? "#70D90012" : "transparent",
      }}
    >
      <Led color={on ? "#70D900" : "#8A969F"} pulse={on} />
      {on ? "ВКЛ" : "ВЫКЛ"}
    </span>
  );
}

/* ---------------- KV row ---------------- */

export function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px] border-b border-line/60 last:border-0">
      <span className="text-[11px] text-mut">{k}</span>
      <span className="num text-[12px] text-ink text-right">{children}</span>
    </div>
  );
}

/* ---------------- кнопки ---------------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "ghost" | "danger";
  busy?: boolean;
};

export function Btn({ tone = "ghost", busy = false, children, className = "", disabled, ...rest }: BtnProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[11.5px] font-semibold tracking-[0.06em] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none";
  const tones = {
    primary: "bg-acc hover:bg-acc2 text-white shadow-[0_2px_10px_rgba(8,120,209,0.3)]",
    ghost: "bg-panel2 border border-line text-ink/90 hover:border-line2 hover:bg-[#142230]",
    danger: "bg-[#2A120F] border border-[#FF3D3255] text-[#FF8B84] hover:bg-[#3A1713]",
  };
  return (
    <button type="button" className={`${base} ${tones[tone]} ${className}`} disabled={disabled || busy} {...rest}>
      {busy && <Loader2 size={12} className="spin" />}
      {children}
    </button>
  );
}

export function IconBtn({
  title,
  onClick,
  children,
  busy = false,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={busy}
      className="w-7 h-7 inline-flex items-center justify-center rounded border border-line bg-panel2 text-mut hover:text-ink hover:border-line2 transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 size={12} className="spin" /> : children}
    </button>
  );
}

export function CopyBtn({ getText, label }: { getText: () => string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(false), 1400);
    return () => window.clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      onClick={() => {
        void copyText(getText()).then((ok) => setDone(ok));
      }}
      className="inline-flex items-center gap-1 rounded border border-line bg-panel2 px-1.5 py-[3px] text-[10px] text-mut hover:text-ink hover:border-line2 transition-colors"
    >
      {done ? <Check size={10} className="text-ok" /> : <Copy size={10} />}
      {done ? "Скопировано" : (label ?? "Копировать")}
    </button>
  );
}

/* ---------------- диалоги / пустые состояния ---------------- */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="reveal w-full max-w-sm rounded-lg border border-line2 bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-line">
          <div className="font-display font-semibold text-[13px] tracking-[0.08em] uppercase">{title}</div>
        </div>
        <div className="px-4 py-3.5 text-[12.5px] text-mut leading-relaxed">{body}</div>
        <div className="px-4 py-3 border-t border-line flex justify-end gap-2">
          <Btn onClick={onCancel} disabled={busy}>
            Отмена
          </Btn>
          <Btn tone="danger" onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  const IconCmp = Icon ?? AlertTriangle;
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "py-5" : "py-10"} px-4`}
    >
      <IconCmp size={compact ? 20 : 26} className="text-mut/50" strokeWidth={1.6} />
      <div className="mt-2 text-[13px] text-ink/80">{title}</div>
      {hint && <div className="mt-1 text-[11px] text-mut max-w-[340px] leading-relaxed">{hint}</div>}
    </div>
  );
}

/* ---------------- JSON viewer ---------------- */

export function JsonViewer({ data, maxH = 260 }: { data: unknown; maxH?: number }) {
  const text = JSON.stringify(data ?? null, null, 2);
  return (
    <div className="rounded border border-line bg-bg overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-line bg-panel2/60">
        <span className="text-[9.5px] tracking-[0.16em] uppercase text-mut">JSON · ответ Gateway</span>
        <CopyBtn getText={() => text} label="Копировать JSON" />
      </div>
      <pre
        className="hexblock p-3 overflow-auto text-ink/85"
        style={{ maxHeight: maxH, fontSize: 10.5 }}
      >
        {text}
      </pre>
    </div>
  );
}

/* ---------------- разделитель секций ---------------- */

export function SectionTitle({ children, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-1" {...rest}>
      <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-mut">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export { str };
