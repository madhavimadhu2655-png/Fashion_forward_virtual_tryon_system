import { useRef, useState } from "react";
import Icon from "../Icon";
import { Notice, Spinner } from "../ui";
import { useTryOnSession } from "../../context/TryOnSessionContext";

const TIPS = [
  "Face the camera, standing straight",
  "Shoulders to hips fully in the photo",
  "Even light, plain background",
  "Just one person, arms relaxed at your sides",
];

/** Photo upload, framing guidance, automatic quality report and consent. */
export default function PhotoPanel({ disabled = false, compact = false }: { disabled?: boolean; compact?: boolean }) {
  const { photo, photoUrl, photoError, quality, qualityChecking, consent, setConsent, choosePhoto, clearPhoto } = useTryOnSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const blocking = quality?.issues.filter((i) => i.severity === "block") ?? [];
  const warnings = quality?.issues.filter((i) => i.severity === "warn") ?? [];

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="photo-step">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-wine">Step 1</p>
          <h2 id="photo-step" className="mt-1 font-display text-2xl">
            Your photo
          </h2>
        </div>
        {photo && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={clearPhoto} disabled={disabled}>
            <Icon name="trash" size={15} /> Remove
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png"
        aria-label="Choose a JPEG or PNG photo"
        onChange={(event) => {
          void choosePhoto(event.target.files?.[0]);
          event.target.value = "";
        }}
        disabled={disabled}
      />

      {photoUrl ? (
        <div className={`mt-4 grid gap-4 ${compact ? "" : "sm:grid-cols-[9rem_1fr]"}`}>
          <div className="relative overflow-hidden rounded-control bg-canvas">
            <img src={photoUrl} alt="Your photo, held only in this page's memory" className="mx-auto max-h-64 w-full object-contain" />
          </div>
          <div className="min-w-0 space-y-2.5">
            <p className="truncate text-xs text-stone">{photo?.name}</p>
            {qualityChecking && <Spinner label="Checking framing, focus and lighting on this device…" className="text-sm text-stone" />}
            {quality && !qualityChecking && quality.issues.length === 0 && (
              <Notice tone="success" title="Photo looks good">
                One person, front-facing, shoulders to hips in frame, sharp and well lit.
              </Notice>
            )}
            {blocking.map((issue) => (
              <Notice key={issue.id} tone="error" title={issue.title}>
                {issue.advice}
              </Notice>
            ))}
            {warnings.map((issue) => (
              <Notice key={issue.id} tone="warning" title={issue.title}>
                {issue.advice}
              </Notice>
            ))}
            <button type="button" className="link text-sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
              Use a different photo
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={`mt-4 flex min-h-[13rem] w-full flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragging ? "border-wine bg-wine-soft" : "border-sand bg-canvas/50 hover:border-ink/40 hover:bg-canvas"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void choosePhoto(event.dataTransfer.files[0]);
            }}
            disabled={disabled}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-porcelain text-wine shadow-soft">
              <Icon name="upload" size={22} />
            </span>
            <span className="mt-4 font-semibold">Drop a photo, or choose a file</span>
            <span className="mt-1.5 text-xs text-stone">JPEG or PNG · up to 8 MB · at least 256 × 384 px</span>
          </button>
          {!compact && (
            <ul className="mt-5 grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
              {TIPS.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <Icon name="check" size={16} className="mt-0.5 shrink-0 text-sage" />
                  {tip}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {photoError && (
        <Notice tone="error" className="mt-4" live>
          {photoError}
        </Notice>
      )}

      {photo && (
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-control bg-canvas/70 p-3.5 text-sm leading-5">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4" disabled={disabled} />
          <span>
            I have permission to use this person's photo. <span className="text-stone">It stays in this tab's memory and isn't stored.</span>
          </span>
        </label>
      )}
    </section>
  );
}
