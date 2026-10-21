import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ProductListItem } from "../types/product";
import ProductImage from "./ProductImage";
import Icon from "./Icon";
import { Price, Swatch } from "./ui";
import { useWishlist } from "../context/WishlistContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="skeleton aspect-[4/5] rounded-card" />
      <div className="skeleton mt-4 h-4 w-3/4 rounded" />
      <div className="skeleton mt-2 h-3 w-1/3 rounded" />
    </div>
  );
}

export default function ProductCard({ product, eager = false }: { product: ProductListItem; eager?: boolean }) {
  const { isWishlisted, toggle } = useWishlist();
  const { addItem } = useCart();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);
  const wishlisted = isWishlisted(product.id);
  const price = product.discount_price ?? product.price;
  const color = product.colors[colorIndex] ?? product.colors[0];
  const sizes = product.sizes ?? [];

  function addToBag(size: string) {
    addItem({
      productId: product.id,
      name: product.name,
      price,
      color: color?.color_name ?? "Default",
      size,
      quantity: 1,
      imageUrl: product.thumbnail_url,
    });
    setPicking(false);
    notify(`${product.name} (${color?.color_name}, ${size}) added to your bag.`, { action: { label: "View bag", to: "/cart" } });
  }

  return (
    <article className="group relative">
      <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-canvas">
        <Link to={`/product/${product.id}`} tabIndex={-1} aria-hidden="true">
          <ProductImage
            src={product.thumbnail_url}
            alt=""
            eager={eager}
            className="h-full w-full transition-transform duration-[900ms] ease-out group-hover:scale-[1.035]"
          />
        </Link>

        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {product.discount_price !== null && product.discount_price < product.price && <span className="badge badge-wine">Sale</span>}
          {product.is_new && <span className="badge badge-neutral">New in</span>}
        </div>

        <button
          type="button"
          onClick={() => toggle(product.id)}
          aria-label={wishlisted ? `Remove ${product.name} from favourites` : `Add ${product.name} to favourites`}
          aria-pressed={wishlisted}
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-porcelain/95 shadow-soft transition-transform hover:scale-105">
            <Icon name="heart" size={17} filled={wishlisted} className={wishlisted ? "text-wine" : "text-ink"} />
          </span>
        </button>

        <div className="card-actions absolute inset-x-3 bottom-3 z-10">
          {picking ? (
            <div className="rounded-control bg-porcelain/95 p-2 shadow-soft backdrop-blur" role="group" aria-label="Choose a size">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-xs font-semibold">Size · {color?.color_name}</span>
                <button type="button" className="rounded-full p-1 text-stone hover:text-ink" onClick={() => setPicking(false)} aria-label="Cancel">
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sizes.map((size) => (
                  <button key={size} type="button" className="btn btn-ghost btn-sm min-w-[2.6rem] flex-1 px-2" onClick={() => addToBag(size)}>
                    {size}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => navigate(`/studio?product=${product.id}&color=${encodeURIComponent(color?.color_name ?? "")}`)} className="btn btn-light btn-sm flex-1">
                <Icon name="sparkle" size={15} /> Try on
              </button>
              {sizes.length > 0 && (
                <button type="button" onClick={() => setPicking(true)} className="btn btn-primary btn-sm flex-1">
                  <Icon name="plus" size={15} /> Add
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold leading-snug">
            <Link to={`/product/${product.id}`} className="after:absolute after:inset-0 after:content-[''] focus:outline-none">
              <span className="relative">{product.name}</span>
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-stone">
            {product.category}
            {product.fabric ? ` · ${product.fabric}` : ""}
          </p>
        </div>
        <div className="relative z-10 shrink-0 pt-0.5 text-right">
          <Price price={price} original={product.discount_price !== null ? product.price : null} size="sm" />
        </div>
      </div>
      {product.colors.length > 0 && (
        <div className="relative z-10 mt-2.5 flex items-center gap-2" role="group" aria-label={`Colours for ${product.name}`}>
          {product.colors.map((c, index) => (
            <Swatch key={c.color_name} hex={c.color_hex} name={c.color_name} size={18} selected={index === colorIndex} onSelect={() => setColorIndex(index)} />
          ))}
          <span className="text-xs text-stone">{color?.color_name}</span>
        </div>
      )}
    </article>
  );
}
