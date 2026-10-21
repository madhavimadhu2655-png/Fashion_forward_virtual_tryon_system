import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import StudioHeader from "../components/studio/StudioHeader";
import PhotoPanel from "../components/studio/PhotoPanel";
import GarmentPicker from "../components/studio/GarmentPicker";
import EnginePicker from "../components/studio/EnginePicker";
import ProductImage from "../components/ProductImage";
import Icon from "../components/Icon";
import { Modal, Notice, Price, Spinner } from "../components/ui";
import { useCatalogue } from "../hooks/useCatalogue";
import { useAiStatus, useGarmentRefs } from "../hooks/useTryOnData";
import { useTryOnSession } from "../context/TryOnSessionContext";
import { fetchGarmentAssets, resolveAssetUrl } from "../services/api";
import { createSerialQueue, type QueuedJob } from "../lib/serialQueue";
import { generationBlockers, runTryOn, type EngineId } from "../lib/tryOnEngine";
import { getGarmentFitProfile } from "../lib/tps/garmentFitProfiles";
import { getGarmentGeometryProfile } from "../lib/tps/garmentGeometry";
import { downloadResult, friendlyWarning, resultLabel } from "../lib/resultActions";

const MAX_SLOTS = 3;

interface Slot {
  key: string;
  productId: string;
  colorName: string;
  status: "idle" | "queued" | "running" | "done" | "error";
  resultId: string | null;
  error: string | null;
}

const newSlot = (productId: string, colorName: string): Slot => ({
  key: crypto.randomUUID(),
  productId,
  colorName,
  status: "idle",
  resultId: null,
  error: null,
});

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const catalogue = useCatalogue();
  const refs = useGarmentRefs();
  const session = useTryOnSession();
  const ai = useAiStatus(true);
  const [engine, setEngine] = useState<EngineId>("browser_fit");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [picker, setPicker] = useState<{ slotKey: string | null; productId: string | null; colorName: string | null } | null>(null);
  const queueRef = useRef(createSerialQueue());
  const jobsRef = useRef(new Map<string, QueuedJob<unknown>>());

  // ?add=CT001:Black pre-fills a slot (from product or studio pages).
  useEffect(() => {
    const add = params.get("add");
    if (!add || catalogue.items.length === 0) return;
    const [productId, color] = add.split(":");
    const product = catalogue.byId(productId);
    const colorName = product?.colors.find((c) => c.color_name === decodeURIComponent(color ?? ""))?.color_name ?? product?.colors[0]?.color_name;
    if (product && colorName) {
      setSlots((current) =>
        current.some((s) => s.productId === product.id && s.colorName === colorName) || current.length >= MAX_SLOTS
          ? current
          : [...current, newSlot(product.id, colorName)],
      );
    }
    params.delete("add");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, catalogue.items.length]);

  // Cancel queued/running jobs when leaving the page.
  useEffect(() => {
    const jobs = jobsRef.current;
    return () => jobs.forEach((job) => job.cancel());
  }, []);

  // If the photo is removed (or a result evicted), slots fall back to "not generated".
  useEffect(() => {
    setSlots((current) =>
      current.map((slot) =>
        slot.resultId && !session.results.some((r) => r.id === slot.resultId) ? { ...slot, status: "idle", resultId: null } : slot,
      ),
    );
  }, [session.results]);

  const patch = (key: string, changes: Partial<Slot>) =>
    setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, ...changes } : slot)));

  const sessionBlockers = generationBlockers({
    engine,
    hasPhoto: Boolean(session.photo),
    qualityChecking: session.qualityChecking,
    qualityBlocking: Boolean(session.quality?.blocking),
    hasProduct: slots.length > 0,
    hasColor: true,
    colorName: "",
    consent: session.consent,
    garmentLoading: false,
    garmentAvailable: true,
    exactColor: true,
    fitProfileAvailable: true,
    aiStatus: ai.status,
    aiStatusError: ai.error,
    generating: false,
  }).map((r) => (r === "Choose a crop top." ? "Add at least two tops to compare." : r));
  if (slots.length === 1) sessionBlockers.push("Add at least one more top to compare.");

  function slotIssue(slot: Slot): string | null {
    if (engine === "catvton" && !refs.isExact(slot.productId, slot.colorName))
      return `No exact ${slot.colorName} garment reference for AI generation. Switch to the browser fit preview or choose another colour.`;
    if (engine === "browser_fit" && !(getGarmentFitProfile(slot.productId) && getGarmentGeometryProfile(slot.productId)))
      return "This product has no fitting profile yet.";
    return null;
  }

  function enqueue(slot: Slot) {
    const photo = session.photo;
    const photoUrl = session.photoUrl;
    if (!photo || !photoUrl) return;
    const product = catalogue.byId(slot.productId);
    const color = product?.colors.find((c) => c.color_name === slot.colorName);
    if (!product || !color) return;
    const issue = slotIssue(slot);
    if (issue) {
      patch(slot.key, { status: "error", error: issue });
      return;
    }
    jobsRef.current.get(slot.key)?.cancel();
    patch(slot.key, { status: "queued", error: null });
    const job = queueRef.current.enqueue(slot.key, async (signal) => {
      patch(slot.key, { status: "running" });
      const asset = engine === "browser_fit" ? await fetchGarmentAssets(product.id, color.color_name) : null;
      if (asset && !asset.asset_available) throw new Error("This product has no garment cutout yet.");
      const output = await runTryOn({
        engine,
        photo,
        photoUrl,
        productId: product.id,
        colorName: color.color_name,
        colorHex: color.color_hex,
        garmentUrl: resolveAssetUrl(asset?.tryon_url) ?? null,
        exactColor: engine === "catvton" ? true : Boolean(asset?.exact_color_match),
        consent: session.consent,
        signal,
      });
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      return session.addResult({
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
    });
    jobsRef.current.set(slot.key, job);
    job.promise
      .then((result) => patch(slot.key, { status: "done", resultId: result.id }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        patch(slot.key, { status: "error", error: err instanceof Error ? err.message : "Generation failed." });
      })
      .finally(() => {
        if (jobsRef.current.get(slot.key) === job) jobsRef.current.delete(slot.key);
      });
  }

  function generateAll() {
    slots.filter((s) => s.status === "idle" || s.status === "error").forEach(enqueue);
  }

  function removeSlot(key: string) {
    jobsRef.current.get(key)?.cancel();
    const slot = slots.find((s) => s.key === key);
    if (slot?.resultId) session.removeResult(slot.resultId);
    setSlots((current) => current.filter((s) => s.key !== key));
  }

  function confirmPicker() {
    if (!picker?.productId || !picker.colorName) return;
    if (picker.slotKey) {
      const old = slots.find((s) => s.key === picker.slotKey);
      jobsRef.current.get(picker.slotKey)?.cancel();
      if (old?.resultId) session.removeResult(old.resultId);
      patch(picker.slotKey, { productId: picker.productId, colorName: picker.colorName, status: "idle", resultId: null, error: null });
    } else {
      setSlots((current) => [...current, newSlot(picker.productId!, picker.colorName!)].slice(0, MAX_SLOTS));
    }
    setPicker(null);
  }

  const queuePosition = useMemo(() => {
    const order = slots.filter((s) => s.status === "queued" || s.status === "running");
    return (key: string) => order.findIndex((s) => s.key === key);
  }, [slots]);

  const anyBusy = slots.some((s) => s.status === "queued" || s.status === "running");
  const pending = slots.filter((s) => s.status === "idle" || s.status === "error").length;

  return (
    <div className="page pb-16 pt-10 lg:pt-14">
      <StudioHeader
        title="Compare looks"
        lede="Try two or three tops on the same photo and see the real results side by side. Each one is generated in turn to keep memory use safe."
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[22rem_1fr] lg:gap-8">
        <div className="min-w-0 space-y-6 lg:sticky lg:top-24">
          <PhotoPanel compact disabled={anyBusy} />
          <section className="card p-5">
            <h2 className="font-display text-xl">Method</h2>
            <div className="mt-3">
              <EnginePicker engine={engine} onChange={setEngine} aiStatus={ai.status} aiStatusError={ai.error} onRecheck={ai.recheck} disabled={anyBusy} />
            </div>
          </section>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone">
              {slots.length} of {MAX_SLOTS} tops
            </p>
            <div className="flex flex-wrap gap-2">
              {slots.length < MAX_SLOTS && (
                <button type="button" className="btn btn-ghost" onClick={() => setPicker({ slotKey: null, productId: catalogue.items[0]?.id ?? null, colorName: catalogue.items[0]?.colors[0]?.color_name ?? null })}>
                  <Icon name="plus" size={16} /> Add a top
                </button>
              )}
              <button type="button" className="btn btn-accent" disabled={sessionBlockers.length > 0 || pending === 0 || anyBusy} onClick={generateAll}>
                <Icon name="sparkle" size={16} /> Generate {pending > 1 ? `all ${pending}` : ""}
              </button>
            </div>
          </div>

          {sessionBlockers.length > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-control bg-canvas/70 p-4" aria-live="polite">
              {sessionBlockers.map((reason) => (
                <li key={reason} className="flex gap-2 text-sm text-ink-soft">
                  <Icon name="info" size={16} className="mt-0.5 shrink-0 text-stone" />
                  {reason}
                </li>
              ))}
            </ul>
          )}

          <div className={`mt-6 grid gap-5 ${slots.length >= 3 ? "md:grid-cols-3" : "sm:grid-cols-2"}`}>
            {slots.map((slot, index) => {
              const product = catalogue.byId(slot.productId);
              const result = session.results.find((r) => r.id === slot.resultId) ?? null;
              const position = queuePosition(slot.key);
              const issue = slotIssue(slot);
              return (
                <article key={slot.key} className="card flex flex-col overflow-hidden" aria-label={`Look ${index + 1}: ${product?.name ?? slot.productId}, ${slot.colorName}`}>
                  <div className="relative aspect-[3/4] bg-canvas">
                    {result ? (
                      <>
                        <img src={result.url} alt={`Try-on result: ${result.productName} in ${result.colorName}`} className="h-full w-full object-cover" />
                        <span className="badge badge-wine absolute left-3 top-3">{resultLabel(result)}</span>
                      </>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-stone">
                        {slot.status === "running" ? (
                          <Spinner label="Generating…" />
                        ) : slot.status === "queued" ? (
                          <>
                            <Icon name="clock" size={22} />
                            <p className="mt-2">Queued — {position <= 0 ? "next" : `${position} ahead`}</p>
                          </>
                        ) : slot.status === "error" ? (
                          <>
                            <Icon name="alert" size={22} className="text-danger" />
                            <p className="mt-2 text-danger">{slot.error}</p>
                          </>
                        ) : (
                          <>
                            <Icon name="image" size={22} />
                            <p className="mt-2">Not generated yet</p>
                            {issue && <p className="mt-2 text-xs text-amber">{issue}</p>}
                          </>
                        )}
                      </div>
                    )}
                    <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-porcelain/95 text-xs font-semibold shadow-soft">
                      {index + 1}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex gap-3">
                      <ProductImage src={product?.thumbnail_url} alt="" className="h-14 w-11 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <Link to={`/product/${slot.productId}`} className="line-clamp-2 text-sm font-semibold hover:underline">
                          {product?.name ?? slot.productId}
                        </Link>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone">
                          <span className="h-3 w-3 rounded-full ring-1 ring-ink/15" style={{ backgroundColor: product?.colors.find((c) => c.color_name === slot.colorName)?.color_hex }} />
                          {slot.colorName} · {product?.fabric}
                        </p>
                        {product && <Price price={product.discount_price ?? product.price} original={product.discount_price !== null ? product.price : null} size="sm" />}
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-stone">Small image: catalogue photo for reference.</p>
                    {result?.warning && <p className="mt-2 text-xs text-amber">{friendlyWarning(result.warning)}</p>}
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                      {result && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadResult(result)} aria-label={`Download look ${index + 1}`}>
                          <Icon name="download" size={14} />
                        </button>
                      )}
                      {(slot.status === "error" || (slot.status === "idle" && !result)) && sessionBlockers.length === 0 && slots.length > 1 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => enqueue(slot)}>
                          <Icon name="refresh" size={14} /> {slot.status === "error" ? "Retry" : "Generate"}
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker({ slotKey: slot.key, productId: slot.productId, colorName: slot.colorName })}>
                        Replace
                      </button>
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => removeSlot(slot.key)} aria-label={`Remove look ${index + 1}`}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {slots.length === 0 && (
              <div className="surface col-span-full flex flex-col items-center px-6 py-16 text-center">
                <Icon name="compare" size={28} className="text-wine" />
                <p className="mt-4 font-display text-2xl">Pick two or three tops</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-stone">Each look is generated on your photo; we never show a catalogue image in place of a result.</p>
                <button type="button" className="btn btn-primary mt-6" onClick={() => setPicker({ slotKey: null, productId: catalogue.items[0]?.id ?? null, colorName: catalogue.items[0]?.colors[0]?.color_name ?? null })}>
                  <Icon name="plus" size={16} /> Add a top
                </button>
              </div>
            )}
          </div>
          {catalogue.error && (
            <Notice tone="error" className="mt-6">
              {catalogue.error}
            </Notice>
          )}
        </div>
      </div>

      <Modal
        open={picker !== null}
        onClose={() => setPicker(null)}
        title={picker?.slotKey ? "Replace this look" : "Add a top to compare"}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPicker(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmPicker} disabled={!picker?.productId || !picker.colorName}>
              {picker?.slotKey ? "Replace" : "Add"}
            </button>
          </>
        }
      >
        <GarmentPicker
          products={catalogue.items}
          loading={catalogue.loading}
          productId={picker?.productId ?? null}
          colorName={picker?.colorName ?? null}
          onChange={(productId, colorName) => setPicker((p) => (p ? { ...p, productId, colorName } : p))}
          isExact={refs.isExact}
          heading="Choose a top and colour"
        />
      </Modal>
    </div>
  );
}
