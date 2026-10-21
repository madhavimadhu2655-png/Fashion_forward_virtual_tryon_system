import { useEffect, useId, useRef, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

export const formatINR = (amount: number) =>
  `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;

type Tone = "info" | "success" | "warning" | "error";
const TONE_ICON: Record<Tone, IconName> = { info: "info", success: "check", warning: "alert", error: "alert" };

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className = "",
  live = false,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Announce to screen readers when it appears. */
  live?: boolean;
}) {
  return (
    <div
      className={`notice notice-${tone} ${className}`}
      role={live ? (tone === "error" ? "alert" : "status") : undefined}
    >
      <Icon name={TONE_ICON[tone]} size={18} className="mt-[3px] shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  lede,
  action,
  as: Tag = "h2",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <Tag className={Tag === "h1" ? "font-display text-4xl leading-[1.05] sm:text-5xl" : "section-title"}>
          {title}
        </Tag>
        {lede && <p className="lede mt-3">{lede}</p>}
      </div>
      {action}
    </div>
  );
}

export function Price({ price, original, size = "md" }: { price: number; original?: number | null; size?: "sm" | "md" | "lg" }) {
  const main = size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-base";
  return (
    <span className="inline-flex items-baseline gap-2 tabular">
      <span className={`${main} font-semibold text-ink`}>{formatINR(price)}</span>
      {original != null && original > price && (
        <>
          <span className="text-sm text-stone line-through">{formatINR(original)}</span>
          <span className="sr-only">Reduced from {formatINR(original)}</span>
        </>
      )}
    </span>
  );
}

export function Swatch({
  hex,
  name,
  selected,
  onSelect,
  size = 36,
  note,
}: {
  hex: string;
  name: string;
  selected?: boolean;
  onSelect?: () => void;
  size?: number;
  /** Extra context for screen readers, e.g. "no exact AI reference". */
  note?: string;
}) {
  const light = isLightHex(hex);
  const style = { backgroundColor: hex, width: size, height: size };
  const label = note ? `${name} (${note})` : name;
  if (!onSelect) {
    return <span className="swatch" style={style} title={name} role="img" aria-label={name} />;
  }
  return (
    <button type="button" className="swatch" style={style} aria-pressed={selected} aria-label={label} title={label} onClick={onSelect}>
      {selected && <Icon name="check" size={size * 0.45} strokeWidth={2.2} className={light ? "text-ink" : "text-ivory"} />}
    </button>
  );
}

export function isLightHex(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return true;
  const value = Number.parseInt(match[1], 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 165;
}

export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Avatar({ initials, hue, size = 36, ring = false }: { initials: string; hue: number; size?: number; ring?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${ring ? "ring-2 ring-porcelain" : ""}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        backgroundColor: `hsl(${hue} 32% 88%)`,
        color: `hsl(${hue} 40% 24%)`,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));
    (focusable()[0] ?? panel)?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const items = focusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="fade-in absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`sheet-up relative max-h-[92vh] w-full overflow-y-auto rounded-t-card bg-porcelain shadow-lift sm:rounded-card ${size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <h2 id={titleId} className="font-display text-xl">
            {title}
          </h2>
          <button type="button" className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyPanel({
  icon = "sparkle",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-porcelain text-wine shadow-soft">
        <Icon name={icon} size={24} />
      </span>
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-stone">{body}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
