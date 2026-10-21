import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";

interface Props {
  beforeUrl: string;
  afterUrl: string;
  beforeAlt: string;
  afterAlt: string;
  afterLabel?: string;
  className?: string;
}

export const clampPosition = (value: number) => Math.min(100, Math.max(0, value));

/** Next slider position for a key press, or null if the key isn't handled. */
export function keyToPosition(key: string, position: number, shift: boolean): number | null {
  const step = shift ? 10 : 2;
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clampPosition(position - step);
    case "ArrowRight":
    case "ArrowUp":
      return clampPosition(position + step);
    case "PageDown":
      return clampPosition(position - 10);
    case "PageUp":
      return clampPosition(position + 10);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

/**
 * Drag a divider between the original photo and a real generated result.
 * The frame takes the RESULT's aspect ratio and the original is drawn with
 * object-cover, so both stay aligned even when the AI model centre-crops
 * the photo (CatVTON returns 3:4) — the browser fit keeps the same aspect.
 */
export default function BeforeAfterSlider({ beforeUrl, afterUrl, beforeAlt, afterAlt, afterLabel = "After", className = "" }: Props) {
  const [position, setPosition] = useState(50);
  const [aspect, setAspect] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPosition(50);
    const probe = new Image();
    probe.onload = () => setAspect(probe.naturalWidth / probe.naturalHeight);
    probe.src = afterUrl;
    return () => {
      probe.onload = null;
    };
  }, [afterUrl]);

  const moveTo = useCallback((clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(clampPosition(((clientX - rect.left) / rect.width) * 100));
  }, []);

  return (
    <div className={className}>
      <div
        ref={frameRef}
        className={`relative mx-auto w-full touch-none select-none overflow-hidden rounded-card bg-canvas ${dragging ? "cursor-grabbing" : "cursor-ew-resize"}`}
        style={{ aspectRatio: aspect ?? 3 / 4, maxHeight: "72vh", maxWidth: aspect ? `calc(72vh * ${aspect})` : undefined }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          moveTo(event.clientX);
        }}
        onPointerMove={(event) => dragging && moveTo(event.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <img src={beforeUrl} alt={beforeAlt} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
          <img src={afterUrl} alt={afterAlt} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        </div>

        <span className="badge badge-neutral pointer-events-none absolute left-3 top-3">Original</span>
        <span className="badge badge-wine pointer-events-none absolute right-3 top-3">{afterLabel}</span>

        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-porcelain shadow-[0_0_0_1px_rgb(30_26_24/0.15)]" style={{ left: `${position}%` }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Before and after comparison. Left shows more of the original photo, right shows more of the result."
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${Math.round(100 - position)}% result visible`}
          onKeyDown={(event) => {
            const next = keyToPosition(event.key, position, event.shiftKey);
            if (next !== null) {
              event.preventDefault();
              setPosition(next);
            }
          }}
          className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-porcelain text-ink shadow-lift focus-visible:ring-4 focus-visible:ring-wine/40"
          style={{ left: `${position}%` }}
        >
          <Icon name="chevronLeft" size={14} strokeWidth={2.2} />
          <Icon name="chevronRight" size={14} strokeWidth={2.2} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-stone">
        <span>Drag, or focus the handle and use the arrow keys.</span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPosition(50)} disabled={position === 50}>
          <Icon name="refresh" size={14} /> Reset
        </button>
      </div>
    </div>
  );
}
