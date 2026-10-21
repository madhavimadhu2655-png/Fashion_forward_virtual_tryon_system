import type { ProductListItem } from "../../types/product";
import ProductImage from "../ProductImage";
import Icon from "../Icon";
import { Price, Swatch } from "../ui";

interface Props {
  products: ProductListItem[];
  loading: boolean;
  productId: string | null;
  colorName: string | null;
  onChange: (productId: string, colorName: string) => void;
  isExact: (productId: string, colorName: string) => boolean;
  disabled?: boolean;
  heading?: string;
  step?: string;
}

/** Product strip + colour swatches, marking which colours have an exact garment reference. */
export default function GarmentPicker({ products, loading, productId, colorName, onChange, isExact, disabled, heading = "Choose a crop top", step }: Props) {
  const selected = products.find((p) => p.id === productId) ?? null;

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="garment-step">
      {step && <p className="text-xs font-semibold text-wine">{step}</p>}
      <h2 id="garment-step" className="mt-1 font-display text-2xl">
        {heading}
      </h2>

      <div className="no-scrollbar -mx-5 mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6" role="listbox" aria-label="Crop tops">
        {loading
          ? Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-32 w-24 shrink-0 rounded-control" />)
          : products.map((p) => {
              const active = p.id === productId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={disabled}
                  onClick={() => onChange(p.id, (p.colors.find((c) => isExact(p.id, c.color_name)) ?? p.colors[0])?.color_name ?? "")}
                  className={`w-24 shrink-0 snap-start text-left transition ${active ? "" : "opacity-80 hover:opacity-100"}`}
                >
                  <span className={`block overflow-hidden rounded-control ring-offset-2 ring-offset-porcelain ${active ? "ring-2 ring-ink" : "ring-1 ring-line"}`}>
                    <ProductImage src={p.thumbnail_url} alt="" className="aspect-[4/5] w-full" />
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-[11px] leading-tight">{p.name}</span>
                </button>
              );
            })}
      </div>

      {selected && (
        <div className="mt-5 rounded-control bg-canvas/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{selected.name}</p>
              <p className="text-xs text-stone">
                {selected.category} · {selected.fabric}
              </p>
            </div>
            <Price price={selected.discount_price ?? selected.price} original={selected.discount_price !== null ? selected.price : null} size="sm" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3" role="group" aria-label="Colour">
            {selected.colors.map((c) => {
              const exact = isExact(selected.id, c.color_name);
              return (
                <span key={c.color_name} className="relative">
                  <Swatch
                    hex={c.color_hex}
                    name={c.color_name}
                    size={32}
                    selected={colorName === c.color_name}
                    onSelect={disabled ? undefined : () => onChange(selected.id, c.color_name)}
                    note={exact ? "exact garment reference" : "no exact garment reference"}
                  />
                  {exact && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-sage text-ivory ring-2 ring-porcelain" aria-hidden="true">
                      <Icon name="check" size={10} strokeWidth={3} />
                    </span>
                  )}
                </span>
              );
            })}
            <span className="text-sm">{colorName}</span>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-stone">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sage text-ivory">
              <Icon name="check" size={8} strokeWidth={3} />
            </span>
            Exact garment reference — no recolouring needed
          </p>
        </div>
      )}
    </section>
  );
}
