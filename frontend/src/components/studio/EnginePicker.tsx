import Icon from "../Icon";
import { Spinner } from "../ui";
import { ENGINE_DESCRIPTION, ENGINE_LABEL, type EngineId } from "../../lib/tryOnEngine";
import type { PhotoTryOnStatus } from "../../services/api";

interface Props {
  engine: EngineId;
  onChange: (engine: EngineId) => void;
  aiStatus: PhotoTryOnStatus | null;
  aiStatusError: boolean;
  onRecheck: () => void;
  disabled?: boolean;
}

export function AiStatusChecklist({ status, error, onRecheck }: { status: PhotoTryOnStatus | null; error: boolean; onRecheck: () => void }) {
  if (error) return <p className="text-xs text-danger">Couldn't reach the backend to check the AI worker.</p>;
  if (!status) return <Spinner label="Checking the local AI worker…" className="text-xs text-stone" />;
  return (
    <div>
      <ul className="space-y-1.5">
        {(status.checks ?? []).map((check) => (
          <li key={check.id} className="flex gap-2 text-xs leading-5">
            <Icon name={check.ok ? "check" : "close"} size={14} className={`mt-0.5 shrink-0 ${check.ok ? "text-sage" : "text-danger"}`} />
            <span>
              <span className={check.ok ? "text-ink-soft" : "font-medium text-ink"}>{check.label}</span>
              {!check.ok && <span className="block text-stone">{check.help}</span>}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="mt-2 text-xs font-semibold text-wine hover:underline" onClick={onRecheck}>
        Check again
      </button>
    </div>
  );
}

export default function EnginePicker({ engine, onChange, aiStatus, aiStatusError, onRecheck, disabled }: Props) {
  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="sr-only">Try-on method</legend>
      {(["browser_fit", "catvton"] as EngineId[]).map((id) => {
        const active = engine === id;
        const unavailable = id === "catvton" && aiStatus !== null && !aiStatus.available;
        return (
          <label
            key={id}
            className={`flex cursor-pointer gap-3 rounded-control border p-4 transition-colors ${
              active ? "border-ink bg-porcelain shadow-soft" : "border-line bg-porcelain/60 hover:border-sand"
            }`}
          >
            <input type="radio" name="engine" value={id} checked={active} onChange={() => onChange(id)} className="mt-1 h-4 w-4" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {ENGINE_LABEL[id]}
                {id === "browser_fit" && <span className="badge badge-sage">On this device</span>}
                {id === "catvton" &&
                  (aiStatus?.available ? (
                    <span className="badge badge-sage">Ready</span>
                  ) : unavailable ? (
                    <span className="badge badge-amber">Not running</span>
                  ) : null)}
              </span>
              <span className="mt-1 block text-xs leading-5 text-stone">{ENGINE_DESCRIPTION[id]}</span>
              {id === "catvton" && active && (
                <span className="mt-3 block border-t border-line pt-3">
                  <AiStatusChecklist status={aiStatus} error={aiStatusError} onRecheck={onRecheck} />
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
