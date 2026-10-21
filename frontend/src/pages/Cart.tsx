import { Link } from "react-router-dom";
import ProductImage from "../components/ProductImage";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import { formatINR } from "../components/ui";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { useToast } from "../context/ToastContext";

export default function Cart() {
  const { items, removeItem, updateQuantity, subtotal, itemCount } = useCart();
  const { isWishlisted, toggle } = useWishlist();
  const { notify } = useToast();

  if (items.length === 0) {
    return <EmptyState icon="bag" title="Your bag is empty" body="Find a top you love — or try one on first." cta={{ to: "/shop", label: "Browse crop tops" }} />;
  }

  function moveToFavourites(productId: string, color: string, size: string, name: string) {
    if (!isWishlisted(productId)) toggle(productId);
    removeItem(productId, color, size);
    notify(`${name} moved to favourites.`);
  }

  return (
    <div className="page pb-32 pt-10 lg:pb-16 lg:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-8">
        <div>
          <p className="eyebrow">Your bag</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </h1>
        </div>
        <Link to="/shop" className="link text-sm">
          Continue shopping
        </Link>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul aria-label="Bag items" className="divide-y divide-line">
          {items.map((item) => (
            <li key={`${item.productId}-${item.color}-${item.size}`} className="flex gap-4 py-6 first:pt-0 sm:gap-6">
              <Link to={`/product/${item.productId}`} aria-label={`View ${item.name}`} className="shrink-0 overflow-hidden rounded-control">
                <ProductImage src={item.imageUrl} alt="" className="h-36 w-28 sm:h-44 sm:w-36" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/product/${item.productId}`} className="line-clamp-2 font-semibold leading-snug hover:underline sm:text-lg">
                      {item.name}
                    </Link>
                    <p className="mt-1 text-sm text-stone">
                      {item.color} · Size {item.size}
                    </p>
                    <p className="mt-0.5 text-xs text-stone tabular">{formatINR(item.price)} each</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular sm:text-lg">{formatINR(item.price * item.quantity)}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                  <div className="inline-flex h-10 items-center rounded-full border border-sand" role="group" aria-label={`Quantity of ${item.name}`}>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.productId, item.color, item.size, item.quantity - 1)}
                      aria-label="Decrease quantity"
                      disabled={item.quantity <= 1}
                      className="flex h-10 w-10 items-center justify-center rounded-l-full hover:bg-canvas disabled:opacity-40"
                    >
                      <Icon name="minus" size={16} />
                    </button>
                    <span className="min-w-8 text-center text-sm font-semibold tabular" aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.productId, item.color, item.size, item.quantity + 1)}
                      aria-label="Increase quantity"
                      className="flex h-10 w-10 items-center justify-center rounded-r-full hover:bg-canvas"
                    >
                      <Icon name="plus" size={16} />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveToFavourites(item.productId, item.color, item.size, item.name)} className="btn btn-quiet btn-sm">
                      <Icon name="heart" size={15} /> Save for later
                    </button>
                    <button type="button" onClick={() => removeItem(item.productId, item.color, item.size)} className="btn btn-quiet btn-sm">
                      <Icon name="trash" size={15} /> Remove
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="card hidden p-6 lg:sticky lg:top-24 lg:block" aria-label="Order summary">
          <h2 className="font-display text-2xl">Summary</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone">Subtotal ({itemCount})</dt>
              <dd className="tabular">{formatINR(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone">Delivery</dt>
              <dd className="text-stone">Not charged in this demo</dd>
            </div>
          </dl>
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-semibold">Total</span>
            <span className="font-display text-3xl tabular">{formatINR(subtotal)}</span>
          </div>
          <Link to="/checkout" className="btn btn-primary btn-lg mt-6 w-full">
            Checkout <Icon name="arrowRight" size={18} />
          </Link>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-stone">
            <Icon name="info" size={14} /> Demonstration checkout — no payment is taken.
          </p>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-stone">Total</p>
            <p className="font-display text-2xl tabular">{formatINR(subtotal)}</p>
          </div>
          <Link to="/checkout" className="btn btn-primary btn-lg flex-1 sm:flex-none sm:px-10">
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
