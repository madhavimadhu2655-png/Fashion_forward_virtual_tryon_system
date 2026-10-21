import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import StudioHeader from "../components/studio/StudioHeader";
import PhotoPanel from "../components/studio/PhotoPanel";
import GarmentPicker from "../components/studio/GarmentPicker";
import EnginePicker from "../components/studio/EnginePicker";
import BeforeAfterSlider from "../components/BeforeAfterSlider";
import Icon from "../components/Icon";
import { Notice, Spinner, formatINR } from "../components/ui";
import { useCatalogue } from "../hooks/useCatalogue";
import { useAiStatus, useFitAsset, useGarmentRefs } from "../hooks/useTryOnData";
import { useTryOnSession, type TryOnResult } from "../context/TryOnSessionContext";
import { useToast } from "../context/ToastContext";
import { createSavedLook, resolveAssetUrl } from "../services/api";
import { ENGINE_LABEL, generationBlockers, runTryOn, type EngineId } from "../lib/tryOnEngine";
import { downloadResult, friendlyWarning, resultLabel } from "../lib/resultActions";
import { DEFAULT_GARMENT_FIT_ADJUSTMENTS, type GarmentFitAdjustments } from "../lib/tps/garmentFitProfiles";

const ADJUSTMENTS: { key: keyof GarmentFitAdjustments; label: string; min: number; max: number; percent: "scale" | "offset" }[] = [
  { key: "shoulderScale", label: "Shoulder width", min: 0.8, max: 1.2, percent: "scale" },
  { key: "torsoScale", label: "Torso width", min: 0.8, max: 1.25, percent: "scale" },
  { key: "lengthScale", label: "Garment length", min: 0.8, max: 1.12, percent: "scale" },
  { key: "verticalOffset", label: "Move up / down", min: -0.06, max: 0.06, percent: "offset" },
  { key: "horizontalOffset", label: "Move left / right", min: -0.06, max: 0.06, percent: "offset" },
];

export default function PhotoStudio() {
  const [params, setParams] = useSearchParams();
  const catalogue = useCatalogue();
  const refs = useGarmentRefs();
  const session = useTryOnSession();
  const { notify } = useToast();

  const productId = params.get("product") ?? catalogue.items[0]?.id ?? null;
  const product = catalogue.byId(productId);
  const requestedColor = params.get("color");
  const colorName = product?.colors.find((c) => c.color_name === requestedColor)?.color_name ?? product?.colors[0]?.color_name ?? null;
  const color = product?.colors.find((c) => c.color_name === colorName) ?? null;

  const [engine, setEngine] = useState<EngineId>("browser_fit");
  const ai = useAiStatus(true);
  const fit = useFitAsset(productId, colorName);
  const [adjustments, setAdjustments] = useState<GarmentFitAdjustments>(DEFAULT_GARMENT_FIT_ADJUSTMENTS);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (!generating) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  const exactColor = engine === "catvton" ? Boolean(productId && colorName && refs.isExact(productId, colorName)) : fit.exactColor;

  const blockers = generationBlockers({
    engine,
    hasPhoto: Boolean(session.photo),
    qualityChecking: session.qualityChecking,
    qualityBlocking: Boolean(session.quality?.blocking),
    hasProduct: Boolean(product),
    hasColor: Boolean(color),
    colorName: colorName ?? "",
    consent: session.consent,
    garmentLoading: fit.loading,
    garmentAvailable: fit.available,
    exactColor,
    fitProfileAvailable: fit.fitProfileAvailable,
    aiStatus: ai.status,
    aiStatusError: ai.error,
    generating,
    colorHex: color?.color_hex ?? null,
    referenceColorName: fit.verifiedColor,
    referenceColorHex: product?.colors.find((c) => c.color_name === fit.verifiedColor)?.color_hex ?? null,
  });

  const current = useMemo(() => {
    const byId = session.results.find((r) => r.id === activeId);
    if (byId) return byId;
    return session.results.find((r) => r.productId === productId && r.colorName === colorName && r.engine === engine) ?? null;
  }, [session.results, activeId, productId, colorName, engine]);

  function select(nextProduct: string, nextColor: string) {
    setActiveId(null);
    setError(null);
    if (nextProduct !== productId) setAdjustments(DEFAULT_GARMENT_FIT_ADJUSTMENTS);
    setParams({ product: nextProduct, color: nextColor }, { replace: true });
  }

  async function generate() {
    if (blockers.length || !session.photo || !session.photoUrl || !product || !color) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setGenerating(true);
    setElapsed(0);
    setError(null);
    setStage(
      engine === "catvton"
        ? "Sending the photo to the local AI worker through the backend. On a GPU this usually takes 20–90 seconds…"
        : "Detecting your pose and fitting the garment on this device…",
    );
    try {
      const output = await runTryOn({
        engine,
        photo: session.photo,
        photoUrl: session.photoUrl,
        productId: product.id,
        colorName: color.color_name,
        colorHex: color.color_hex,
        garmentUrl: resolveAssetUrl(fit.tryonUrl) ?? null,
        exactColor,
        consent: session.consent,
        adjustments,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const result = session.addResult({
        engine,
        productId: product.id,
        productName: product.name,
        colorName: color.color_name,
        colorHex: color.color_hex,
        price: product.discount_price ?? product.price,
        blob: output.blob,
        tinted: output.tinted,
        warning: output.warning,
      });
      setActiveId(result.id);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "The try-on couldn't be generated. Please retry.");
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setGenerating(false);
        setStage("");
      }
    }
  }

  function cancel() {
    requestRef.current?.abort();
    requestRef.current = null;
    setGenerating(false);
    setStage("");
  }

  async function saveLook(result: TryOnResult) {
    setSaving(true);
    try {
      await createSavedLook({ product_id: result.productId, color_name: result.colorName, source: result.engine });
      notify("Look saved (product and colour only — the image isn't stored).", { action: { label: "Saved looks", to: "/saved-looks" } });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't save the look.", { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page pb-16 pt-10 lg:pt-14">
      <StudioHeader
        title="Photo try-on"
        lede="Upload a photo, let us check it, then generate a fitted preview. Slide between your original and the result."
      />

      {catalogue.error && (
        <Notice tone="error" className="mt-6" title="The catalogue couldn't be loaded" action={<button className="btn btn-ghost btn-sm" onClick={catalogue.retry}>Retry</button>}>
          {catalogue.error}
        </Notice>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8">
        <div className="min-w-0 space-y-6">
          <PhotoPanel disabled={generating} />
          <GarmentPicker
            step="Step 2"
            products={catalogue.items}
            loading={catalogue.loading}
            productId={productId}
            colorName={colorName}
            onChange={select}
            isExact={refs.isExact}
            disabled={generating}
          />

          <section className="card p-5 sm:p-6" aria-labelledby="generate-step">
            <p className="text-xs font-semibold text-wine">Step 3</p>
            <h2 id="generate-step" className="mt-1 font-display text-2xl">
              Generate
            </h2>
            <div className="mt-4">
              <EnginePicker
                engine={engine}
                onChange={(next) => {
                  setEngine(next);
                  setActiveId(null);
                  setError(null);
                }}
                aiStatus={ai.status}
                aiStatusError={ai.error}
                onRecheck={ai.recheck}
                disabled={generating}
              />
            </div>

            {engine === "browser_fit" && product && (
              <details className="group mt-4 rounded-control border border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <Icon name="sliders" size={16} /> Fine-tune placement
                  </span>
                  <Icon name="chevronDown" size={16} className="transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 px-4 pb-4">
                  {ADJUSTMENTS.map((a) => {
                    const value = adjustments[a.key];
                    const shown = a.percent === "scale" ? `${Math.round(value * 100)}%` : `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
                    return (
                      <label key={a.key} className="block text-sm">
                        <span className="flex justify-between">
                          {a.label}
                          <span className="tabular text-stone">{shown}</span>
                        </span>
                        <input
                          type="range"
                          min={a.min}
                          max={a.max}
                          step={0.01}
                          value={value}
                          onChange={(e) => setAdjustments((cur) => ({ ...cur, [a.key]: Number(e.target.value) }))}
                          className="mt-1.5 w-full"
                          disabled={generating}
                        />
                      </label>
                    );
                  })}
                  <div className="flex justify-between gap-3">
                    <p className="text-xs leading-5 text-stone">Generate again to apply. Changes only move the cutout.</p>
                    <button type="button" className="btn btn-quiet btn-sm shrink-0" onClick={() => setAdjustments(DEFAULT_GARMENT_FIT_ADJUSTMENTS)}>
                      Reset
                    </button>
                  </div>
                </div>
              </details>
            )}

            {product && color && engine === "browser_fit" && fit.available && !fit.exactColor && blockers.length === 0 && (
              <Notice tone="info" className="mt-4">
                The product cutout shows {fit.verifiedColor ?? "another colour"}, so {color.color_name} will be an approximate
                recolour.
              </Notice>
            )}

            {blockers.length > 0 && !generating && (
              <div className="mt-5 rounded-control bg-canvas/70 p-4" aria-live="polite">
                <p className="text-sm font-semibold">Before you can generate</p>
                <ul className="mt-2 space-y-1.5">
                  {blockers.map((reason) => (
                    <li key={reason} className="flex gap-2 text-sm text-ink-soft">
                      <Icon name="info" size={16} className="mt-0.5 shrink-0 text-stone" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className="btn btn-accent btn-lg flex-1" disabled={blockers.length > 0} onClick={() => void generate()}>
                <Icon name="sparkle" size={18} />
                {current ? "Generate again" : engine === "catvton" ? "Generate with AI" : "Generate fit preview"}
              </button>
              {generating && (
                <button type="button" className="btn btn-ghost btn-lg" onClick={cancel}>
                  Cancel
                </button>
              )}
            </div>
            {generating && (
              <div className="mt-4 rounded-control bg-canvas/70 p-4 text-sm" role="status">
                <Spinner label={stage} />
                <p className="mt-1.5 pl-6 text-xs text-stone tabular">{elapsed}s elapsed</p>
              </div>
            )}
            {error && (
              <Notice
                tone="error"
                className="mt-4"
                live
                title="No preview was produced"
                action={
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void generate()} disabled={blockers.length > 0}>
                    <Icon name="refresh" size={14} /> Retry
                  </button>
                }
              >
                {error}
              </Notice>
            )}
          </section>
        </div>

        {/* Preview */}
        <section className="card min-w-0 p-5 sm:p-6 lg:sticky lg:top-24" aria-labelledby="preview-heading" aria-busy={generating}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="preview-heading" className="font-display text-2xl">
                Preview
              </h2>
              <p className="mt-1 text-sm text-stone">
                {current
                  ? `${current.productName} · ${current.colorName} · ${ENGINE_LABEL[current.engine]}`
                  : "Your result appears here — it's never a catalogue photo."}
              </p>
            </div>
            {current && <span className="badge badge-wine">{resultLabel(current)}</span>}
          </div>

          <div className="mt-5">
            {current && session.photoUrl ? (
              <>
                <BeforeAfterSlider
                  beforeUrl={session.photoUrl}
                  afterUrl={current.url}
                  beforeAlt="Original photo"
                  afterAlt={`Try-on result: ${current.productName} in ${current.colorName}`}
                  afterLabel={resultLabel(current)}
                />
                {friendlyWarning(current.warning) && (
                  <Notice tone="warning" className="mt-3">
                    {friendlyWarning(current.warning)}
                  </Notice>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => downloadResult(current)}>
                    <Icon name="download" size={15} /> Download
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void saveLook(current)} disabled={saving}>
                    <Icon name="bookmark" size={15} /> {saving ? "Saving…" : "Save look"}
                  </button>
                  <Link to={`/compare?add=${current.productId}:${encodeURIComponent(current.colorName)}`} className="btn btn-ghost btn-sm">
                    <Icon name="compare" size={15} /> Compare
                  </Link>
                  <Link to="/rooms" className="btn btn-ghost btn-sm">
                    <Icon name="users" size={15} /> Share in a room
                  </Link>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => session.removeResult(current.id)}>
                    <Icon name="trash" size={15} /> Clear
                  </button>
                </div>
                <p className="mt-4 text-xs leading-5 text-stone">
                  A visual preview, not a size guarantee: drape, lighting and colour may differ from the real garment. Download
                  saves a copy to your device; nothing is kept on our servers.
                </p>
              </>
            ) : session.photoUrl ? (
              <div className="relative overflow-hidden rounded-card bg-canvas">
                <img src={session.photoUrl} alt="Your original photo" className={`mx-auto max-h-[70vh] w-full object-contain ${generating ? "opacity-60" : ""}`} />
                <span className="badge badge-neutral absolute left-3 top-3">Original — not yet generated</span>
                {generating && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-porcelain/95 px-4 py-2 text-sm shadow-soft">
                      <Spinner label="Generating…" />
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[26rem] flex-col items-center justify-center rounded-card border border-dashed border-sand bg-canvas/40 px-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-porcelain text-wine shadow-soft">
                  <Icon name="image" size={24} />
                </span>
                <p className="mt-4 font-display text-xl">No photo yet</p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-stone">Add a photo on the left, pick a top and generate. The before-and-after slider unlocks once a real result exists.</p>
              </div>
            )}
          </div>

          {session.results.length > 0 && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-xs font-semibold uppercase tracking-eyebrow text-stone">This session</p>
              <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1">
                {session.results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setActiveId(r.id);
                      setEngine(r.engine);
                      setParams({ product: r.productId, color: r.colorName }, { replace: true });
                    }}
                    className={`w-20 shrink-0 text-left ${current?.id === r.id ? "" : "opacity-75 hover:opacity-100"}`}
                    aria-label={`Show ${r.productName} in ${r.colorName}`}
                  >
                    <span className={`block overflow-hidden rounded-control ${current?.id === r.id ? "ring-2 ring-ink" : "ring-1 ring-line"}`}>
                      <img src={r.url} alt="" className="aspect-[3/4] w-full object-cover" />
                    </span>
                    <span className="mt-1 block truncate text-[11px]">{r.colorName}</span>
                    <span className="block text-[11px] text-stone tabular">{formatINR(r.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
