import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ProductDetail } from "../types/product";
import { createSavedLook, fetchPhotoTryOnCatalog, fetchProduct, type PhotoTryOnProduct } from "../services/api";
import ProductImage from "../components/ProductImage";
import ProductCard from "../components/ProductCard";
import Icon from "../components/Icon";
import { Notice, Price, SectionHeader, Swatch } from "../components/ui";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCatalogue } from "../hooks/useCatalogue";
import { recordRecentlyViewed } from "../lib/recentlyViewed";
import { relatedProducts } from "../lib/recommendations";

const VIEW_LABEL: Record<string, string> = { front: "Front", side: "Side", back: "Back", detail: "Detail" };

const cm = (v: number | null) => (v === null ? "–" : `${v} cm`);

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { isWishlisted, toggle } = useWishlist();
  const { isAuthenticated } = useAuth();
  const { notify } = useToast();
  const catalogue = useCatalogue();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [sizeError, setSizeError] = useState(false);
  const [view, setView] = useState(0);
  const [aiRefs, setAiRefs] = useState<PhotoTryOnProduct | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setView(0);
    setSize("");
    fetchProduct(id)
      .then((data) => {
        if (cancelled) return;
        setProduct(data);
        setColor(data.variants[0]?.color_name ?? "");
        recordRecentlyViewed(data.id);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load product."))
      .finally(() => !cancelled && setLoading(false));
    fetchPhotoTryOnCatalog()
      .then((cat) => !cancelled && setAiRefs(cat.items.find((item) => item.id === id) ?? null))
      .catch(() => !cancelled && setAiRefs(null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const listItem = catalogue.byId(product?.id);
  const related = useMemo(() => (listItem ? relatedProducts(listItem, catalogue.items, 4) : []), [listItem, catalogue.items]);

  if (loading) {
    return (
      <div className="page py-10" aria-busy="true">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="skeleton aspect-[4/5] rounded-card lg:col-span-7" />
          <div className="space-y-4 lg:col-span-5">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-12 w-3/4 rounded" />
            <div className="skeleton h-8 w-32 rounded" />
            <div className="skeleton h-24 w-full rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="page max-w-2xl py-20">
        <Notice tone="error" title="Couldn't load this product" action={<Link to="/shop" className="btn btn-ghost btn-sm">Back to the collection</Link>}>
          {error ?? "Product not found."}
        </Notice>
      </div>
    );
  }

  const price = product.discount_price ?? product.price;
  const gallery = [...product.images].sort((a, b) => a.sort_order - b.sort_order);
  const current = gallery[view] ?? gallery[0];
  const wishlisted = isWishlisted(product.id);
  const exactColors = aiRefs?.colors.filter((c) => c.image_available).map((c) => c.color_name) ?? [];
  const thumbnail = gallery[0]?.image_url ?? null;
  const tryOnHref = `/studio?product=${product.id}&color=${encodeURIComponent(color)}`;

  function add(goTo?: string) {
    if (!size) {
      setSizeError(true);
      document.getElementById("size-picker")?.focus();
      return;
    }
    addItem({ productId: product!.id, name: product!.name, price, color, size, quantity: 1, imageUrl: thumbnail });
    if (goTo) navigate(goTo);
    else notify(`Added to your bag — ${color}, size ${size}.`, { action: { label: "View bag", to: "/cart" } });
  }

  async function saveLook() {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: `/product/${product!.id}` } });
      return;
    }
    setSaving(true);
    try {
      await createSavedLook({ product_id: product!.id, color_name: color, source: null });
      notify("Look saved.", { action: { label: "Saved looks", to: "/saved-looks" } });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't save this look.", { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28 lg:pb-0">
      <div className="page pt-6 lg:pt-10">
        <nav aria-label="Breadcrumb" className="text-xs text-stone">
          <Link to="/shop" className="hover:text-ink">
            Collection
          </Link>
          <span className="mx-2">/</span>
          <Link to={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:text-ink">
            {product.category}
          </Link>
        </nav>

        <div className="mt-5 grid gap-8 lg:grid-cols-12 lg:gap-14">
          {/* Gallery */}
          <div className="lg:col-span-7">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4">
              {gallery.length > 1 && (
                <div className="flex gap-3 sm:w-20 sm:flex-col" role="tablist" aria-label="Product views">
                  {gallery.map((image, index) => (
                    <button
                      key={image.image_url}
                      type="button"
                      role="tab"
                      aria-selected={index === view}
                      aria-label={`${VIEW_LABEL[image.image_type] ?? image.image_type} view`}
                      onClick={() => setView(index)}
                      className={`relative w-20 overflow-hidden rounded-control ring-offset-2 ring-offset-ivory transition ${
                        index === view ? "ring-2 ring-ink" : "opacity-75 ring-1 ring-line hover:opacity-100"
                      }`}
                    >
                      <ProductImage src={image.image_url} alt="" className="aspect-[4/5] w-full" />
                      <span className="sr-only">{VIEW_LABEL[image.image_type]}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="relative flex-1 overflow-hidden rounded-card bg-canvas">
                <ProductImage key={current?.image_url} src={current?.image_url} alt={`${product.name}, ${VIEW_LABEL[current?.image_type ?? "front"]?.toLowerCase()} view`} eager className="aspect-[4/5] w-full" />
                {current && (
                  <span className="badge badge-neutral absolute bottom-4 left-4">{VIEW_LABEL[current.image_type] ?? current.image_type} view</span>
                )}
                {gallery.length > 1 && (
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <button type="button" className="icon-btn h-10 w-10 bg-porcelain/95 shadow-soft" aria-label="Previous view" onClick={() => setView((view - 1 + gallery.length) % gallery.length)}>
                      <Icon name="chevronLeft" size={18} />
                    </button>
                    <button type="button" className="icon-btn h-10 w-10 bg-porcelain/95 shadow-soft" aria-label="Next view" onClick={() => setView((view + 1) % gallery.length)}>
                      <Icon name="chevronRight" size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
            <p className="eyebrow">{product.brand}</p>
            <h1 className="mt-3 font-display text-4xl leading-[1.05] sm:text-[2.75rem]">{product.name}</h1>
            <div className="mt-4">
              <Price price={price} original={product.discount_price !== null ? product.price : null} size="lg" />
            </div>
            <p className="mt-5 text-[15px] leading-7 text-ink-soft">{product.description}</p>

            <div className="mt-7">
              <h2 className="text-sm font-semibold">
                Colour: <span className="font-normal text-stone">{color}</span>
              </h2>
              <div className="mt-3 flex flex-wrap gap-3" role="group" aria-label="Colour">
                {product.variants.map((variant) => (
                  <Swatch
                    key={variant.color_name}
                    hex={variant.color_hex}
                    name={variant.color_name}
                    selected={color === variant.color_name}
                    onSelect={() => setColor(variant.color_name)}
                  />
                ))}
              </div>
              {aiRefs && (
                <p className="mt-3 flex gap-2 text-xs leading-5 text-stone">
                  <Icon name="sparkle" size={14} className="mt-0.5 shrink-0 text-wine" />
                  {exactColors.length
                    ? `Exact try-on reference: ${exactColors.join(", ")}. ${
                        exactColors.includes(color) ? "" : `${color} is previewed as an approximate recolour (browser fit only).`
                      }`
                    : "No exact try-on reference yet; previews are approximate recolours."}
                </p>
              )}
            </div>

            <div className="mt-7">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold" id="size-label">
                  Size{size && <span className="font-normal text-stone">: {size}</span>}
                </h2>
                <a href="#size-guide" className="text-xs text-stone underline underline-offset-4 hover:text-ink">
                  Size guide
                </a>
              </div>
              <div id="size-picker" tabIndex={-1} className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby="size-label">
                {product.sizes.map((s) => (
                  <button
                    key={s.size}
                    type="button"
                    onClick={() => {
                      setSize(s.size);
                      setSizeError(false);
                    }}
                    aria-pressed={size === s.size}
                    className="chip min-w-[3.25rem] justify-center !px-3"
                  >
                    {s.size}
                  </button>
                ))}
              </div>
              {sizeError && (
                <p className="mt-2 text-xs font-medium text-danger" role="alert">
                  Choose a size first.
                </p>
              )}
            </div>

            <div className="mt-8 grid gap-3">
              <Link to={tryOnHref} className="btn btn-accent btn-lg">
                <Icon name="sparkle" size={18} /> Try this top
              </Link>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <button type="button" onClick={() => add()} className="btn btn-primary btn-lg">
                  <Icon name="bag" size={18} /> Add to bag
                </button>
                <button
                  type="button"
                  onClick={() => toggle(product.id)}
                  aria-pressed={wishlisted}
                  aria-label={wishlisted ? "Remove from favourites" : "Add to favourites"}
                  className="btn btn-ghost btn-lg w-12 px-0"
                >
                  <Icon name="heart" size={20} filled={wishlisted} className={wishlisted ? "text-wine" : ""} />
                </button>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <Link to={`/try-on?product=${product.id}`} className="link">
                  Live camera
                </Link>
                <Link to={`/compare?add=${product.id}:${encodeURIComponent(color)}`} className="link">
                  Compare
                </Link>
                <button type="button" className="link" onClick={saveLook} disabled={saving}>
                  {saving ? "Saving…" : "Save this look"}
                </button>
                <button type="button" className="link" onClick={() => add("/checkout")}>
                  Buy now (demo)
                </button>
              </div>
            </div>

            <dl className="mt-9 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line text-sm">
              {[
                ["Fabric", product.fabric],
                ["Fit", product.fit_type],
                ["Style", product.category],
                ["Product code", product.id],
              ].map(([label, value]) => (
                <div key={label} className="bg-porcelain px-4 py-3">
                  <dt className="text-xs text-stone">{label}</dt>
                  <dd className="mt-0.5 font-medium">{value || "–"}</dd>
                </div>
              ))}
            </dl>

            {product.sizes.length > 0 && (
              <details id="size-guide" className="group mt-5 rounded-card border border-line bg-porcelain">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
                  Garment measurements
                  <Icon name="chevronDown" size={16} className="transition-transform group-open:rotate-180" />
                </summary>
                <div className="overflow-x-auto px-4 pb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-stone">
                        {["Size", "Shoulder", "Chest", "Waist", "Length"].map((h) => (
                          <th key={h} className="py-2 pr-2 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {product.sizes.map((s) => (
                        <tr key={s.size} className={`border-t border-line ${s.size === size ? "font-semibold text-ink" : "text-ink-soft"}`}>
                          <td className="py-2 pr-2">{s.size}</td>
                          <td className="py-2 pr-2">{cm(s.shoulder_cm)}</td>
                          <td className="py-2 pr-2">{cm(s.chest_cm)}</td>
                          <td className="py-2 pr-2">{cm(s.waist_cm)}</td>
                          <td className="py-2">{cm(s.length_cm)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-[11px] leading-5 text-stone">
                    Garment measurements, not body measurements. The try-on shows placement and style; it can't verify how a
                    size will fit you.
                  </p>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="page mt-24">
          <SectionHeader eyebrow="Similar styles" title="You may also like" />
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
            {related.map(({ product: p }) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Sticky actions on phones and tablets */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-line bg-ivory/95 p-3 backdrop-blur lg:hidden">
        <Link to={tryOnHref} className="btn btn-accent flex-1 px-3">
          <Icon name="sparkle" size={16} /> Try on
        </Link>
        <button type="button" onClick={() => add()} className="btn btn-primary flex-1 px-3">
          Add to bag
        </button>
      </div>
    </div>
  );
}
