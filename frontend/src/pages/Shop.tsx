import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FilterOptions, ProductListItem } from "../types/product";
import { fetchFilterOptions, fetchProducts } from "../services/api";
import ProductCard, { ProductCardSkeleton } from "../components/ProductCard";
import Icon from "../components/Icon";
import { EmptyPanel, Notice, Swatch, formatINR } from "../components/ui";

// "popular"/"rating" sorts rely on the seed's demo review numbers, so they
// are not offered; only sorts based on real catalogue data are.
const SORTS = [
  { id: "newest", label: "New in" },
  { id: "priceLow", label: "Price: low to high" },
  { id: "priceHigh", label: "Price: high to low" },
] as const;
type SortId = (typeof SORTS)[number]["id"];
const SIZES = ["XS", "S", "M", "L", "XL"];

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <legend className="mb-3 text-[0.7rem] font-semibold uppercase tracking-eyebrow text-stone">{title}</legend>
      {children}
    </fieldset>
  );
}

const list = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const colors = list(params.get("colors"));
  const sizes = list(params.get("sizes"));
  const fabric = params.get("fabric") ?? "";
  const fit = params.get("fit") ?? "";
  const minPrice = params.get("min") ? Number(params.get("min")) : null;
  const maxPrice = params.get("max") ? Number(params.get("max")) : null;
  const sort = (SORTS.some((s) => s.id === params.get("sort")) ? params.get("sort") : "newest") as SortId;

  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);

  useEffect(() => setSearchDraft(q), [q]);

  useEffect(() => {
    fetchFilterOptions()
      .then(setOptions)
      .catch(() => setOptions(null));
  }, []);

  function update(changes: Record<string, string | string[] | number | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      const str = Array.isArray(value) ? value.join(",") : value === null ? "" : String(value);
      if (str) next.set(key, str);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  }

  const toggleIn = (key: string, current: string[], value: string) =>
    update({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProducts({
      search: q || undefined,
      category: category || undefined,
      colors: colors.length ? colors : undefined,
      sizes: sizes.length ? sizes : undefined,
      fabric: fabric || undefined,
      fit: fit || undefined,
      min_price: minPrice ?? undefined,
      max_price: maxPrice ?? undefined,
      sort,
      limit: 60,
    })
      .then((res) => !cancelled && setProducts(res.items))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load products."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString(), attempt]);

  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheetOpen]);

  const active = useMemo(() => {
    const chips: { key: string; label: string; remove: () => void }[] = [];
    if (q) chips.push({ key: "q", label: `“${q}”`, remove: () => update({ q: null }) });
    if (category) chips.push({ key: "cat", label: category, remove: () => update({ category: null }) });
    colors.forEach((c) => chips.push({ key: `c-${c}`, label: c, remove: () => toggleIn("colors", colors, c) }));
    sizes.forEach((s) => chips.push({ key: `s-${s}`, label: `Size ${s}`, remove: () => toggleIn("sizes", sizes, s) }));
    if (fabric) chips.push({ key: "fab", label: fabric, remove: () => update({ fabric: null }) });
    if (fit) chips.push({ key: "fit", label: fit, remove: () => update({ fit: null }) });
    if (minPrice !== null || maxPrice !== null)
      chips.push({
        key: "price",
        label: `${formatINR(minPrice ?? options?.min_price ?? 0)} – ${formatINR(maxPrice ?? options?.max_price ?? 0)}`,
        remove: () => update({ min: null, max: null }),
      });
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString(), options]);

  const clearAll = () => setParams(sort !== "newest" ? { sort } : {}, { replace: true });

  const bounds = { low: Math.floor(options?.min_price ?? 0), high: Math.ceil(options?.max_price ?? 0) };
  const priceLow = minPrice ?? bounds.low;
  const priceHigh = maxPrice ?? bounds.high;

  const panel = (
    <div className="space-y-6 text-sm">
      <FilterGroup title="Style">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="chip" aria-pressed={category === ""} onClick={() => update({ category: null })}>
            All
          </button>
          {(options?.categories ?? []).map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => update({ category: category === c ? null : c })}>
              {c}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Colour">
        <div className="flex flex-wrap gap-x-2 gap-y-3">
          {(options?.colors ?? [])
            .filter((c, i, all) => all.findIndex((o) => o.color_name === c.color_name) === i)
            .map((c) => (
              <span key={c.color_name} className="flex w-[4.25rem] flex-col items-center gap-1.5 text-center">
                <Swatch hex={c.color_hex} name={c.color_name} size={30} selected={colors.includes(c.color_name)} onSelect={() => toggleIn("colors", colors, c.color_name)} />
                <span className="text-[11px] leading-tight text-stone">{c.color_name}</span>
              </span>
            ))}
        </div>
      </FilterGroup>

      {options && bounds.high > bounds.low && (
        <FilterGroup title="Price">
          <div className="flex items-center justify-between text-sm font-medium tabular">
            <span>{formatINR(priceLow)}</span>
            <span>{formatINR(priceHigh)}</span>
          </div>
          <label className="mt-3 block text-xs text-stone">
            Minimum
            <input
              type="range"
              min={bounds.low}
              max={bounds.high}
              step={50}
              value={priceLow}
              onChange={(e) => {
                const value = Math.min(Number(e.target.value), priceHigh);
                update({ min: value <= bounds.low ? null : value });
              }}
              className="mt-1 w-full"
            />
          </label>
          <label className="mt-2 block text-xs text-stone">
            Maximum
            <input
              type="range"
              min={bounds.low}
              max={bounds.high}
              step={50}
              value={priceHigh}
              onChange={(e) => {
                const value = Math.max(Number(e.target.value), priceLow);
                update({ max: value >= bounds.high ? null : value });
              }}
              className="mt-1 w-full"
            />
          </label>
        </FilterGroup>
      )}

      <FilterGroup title="Size">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s} type="button" className="chip min-w-[3rem] justify-center !px-3" aria-pressed={sizes.includes(s)} onClick={() => toggleIn("sizes", sizes, s)}>
              {s}
            </button>
          ))}
        </div>
      </FilterGroup>

      {(options?.fabrics.length ?? 0) > 0 && (
        <FilterGroup title="Fabric">
          <select className="field" value={fabric} onChange={(e) => update({ fabric: e.target.value || null })} aria-label="Fabric">
            <option value="">Any fabric</option>
            {[...(options?.fabrics ?? [])].sort().map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </FilterGroup>
      )}

      {(options?.fits.length ?? 0) > 0 && (
        <FilterGroup title="Fit">
          <div className="flex flex-wrap gap-2">
            {[...(options?.fits ?? [])].sort().map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={fit === f} onClick={() => update({ fit: fit === f ? null : f })}>
                {f}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}
    </div>
  );

  return (
    <div className="page pb-16 pt-10 lg:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
        <div>
          <p className="eyebrow">The collection</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">{category || "All crop tops"}</h1>
          <p className="mt-3 text-sm text-stone" aria-live="polite">
            {loading ? "Loading…" : `${products.length} ${products.length === 1 ? "style" : "styles"}`}
          </p>
        </div>
        <form
          role="search"
          className="relative w-full sm:w-80"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: searchDraft.trim() || null });
          }}
        >
          <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            className="field rounded-full pl-10"
            placeholder="Search by name or style"
            aria-label="Search the collection"
          />
        </form>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[15rem_1fr] xl:grid-cols-[16.5rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-6 pr-2">{panel}</div>
        </aside>

        <section aria-label="Products">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={() => setSheetOpen(true)}>
              <Icon name="filter" size={16} /> Filters{active.length ? ` (${active.length})` : ""}
            </button>
            <div className="flex flex-1 flex-wrap gap-2">
              {active.map((chip) => (
                <button key={chip.key} type="button" onClick={chip.remove} className="chip min-h-0 gap-1.5 py-1.5 text-xs" aria-label={`Remove filter ${chip.label}`}>
                  {chip.label} <Icon name="close" size={13} />
                </button>
              ))}
              {active.length > 1 && (
                <button type="button" className="text-xs font-semibold text-wine underline-offset-4 hover:underline" onClick={clearAll}>
                  Clear all
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-stone">
              Sort
              <select className="field h-9 w-auto rounded-full py-0 text-sm" value={sort} onChange={(e) => update({ sort: e.target.value === "newest" ? null : e.target.value })}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <Notice tone="error" title="Couldn't load the collection" action={<button className="btn btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}>
              {error}
            </Notice>
          ) : loading ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyPanel
              icon="search"
              title="No tops match those filters"
              body="Try removing a filter or searching for a broader style, such as “ribbed” or “tank”."
              action={
                <button type="button" className="btn btn-primary" onClick={clearAll}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 xl:grid-cols-3">
              {products.map((p, index) => (
                <ProductCard key={p.id} product={p} eager={index < 3} />
              ))}
            </div>
          )}
        </section>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="fade-in absolute inset-0 bg-ink/40" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="sheet-up absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-card bg-porcelain">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-display text-xl">Filters</h2>
              <button type="button" className="icon-btn -mr-2" onClick={() => setSheetOpen(false)} aria-label="Close filters">
                <Icon name="close" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{panel}</div>
            <div className="flex gap-3 border-t border-line p-4">
              <button type="button" className="btn btn-ghost flex-1" onClick={clearAll}>
                Clear
              </button>
              <button type="button" className="btn btn-primary flex-1" onClick={() => setSheetOpen(false)}>
                Show {products.length} {products.length === 1 ? "style" : "styles"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
