import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState";
import ProductImage from "../components/ProductImage";
import Icon from "../components/Icon";
import { Notice, formatINR } from "../components/ui";
import { useCart } from "../context/CartContext";

type PaymentMethod = "upi" | "card" | "cod";

const PAYMENT_OPTIONS: { id: PaymentMethod; title: string; detail: string }[] = [
  { id: "upi", title: "UPI", detail: "No UPI request is sent in this demo." },
  { id: "card", title: "Credit / debit card", detail: "No card details are requested or stored." },
  { id: "cod", title: "Cash on delivery", detail: "No delivery is arranged." },
];

/**
 * DEMONSTRATION ONLY. Nothing is submitted to a server, no payment is taken
 * and no order is created; the form only validates input and empties the bag.
 */
export default function Checkout() {
  const { items, subtotal, itemCount, clearCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [finished, setFinished] = useState<{ reference: string; total: number; count: number } | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFinished({ reference: `DEMO-${Date.now().toString().slice(-6)}`, total: subtotal, count: itemCount });
    clearCart();
  }

  if (finished) {
    return (
      <div className="page max-w-2xl py-16 sm:py-24">
        <section className="card p-8 text-center sm:p-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-ink">
            <Icon name="info" size={26} />
          </span>
          <p className="eyebrow mt-6">Demo checkout complete</p>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl">No order was placed</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-stone">
            This walkthrough shows the checkout flow only. No payment was taken, nothing was sent to a server and no delivery
            is coming. Your bag has been emptied.
          </p>
          <dl className="mx-auto mt-6 max-w-xs space-y-2 rounded-control bg-canvas/70 p-4 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-stone">Demo reference</dt>
              <dd className="font-mono">{finished.reference}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone">Items</dt>
              <dd>{finished.count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone">Would have cost</dt>
              <dd className="tabular">{formatINR(finished.total)}</dd>
            </div>
          </dl>
          <Link to="/shop" className="btn btn-primary btn-lg mt-8">
            Back to the collection
          </Link>
        </section>
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState icon="bag" title="Nothing to check out" body="Add a crop top to your bag first." cta={{ to: "/shop", label: "Browse crop tops" }} />;
  }

  return (
    <div className="page pb-32 pt-10 lg:pb-16 lg:pt-14">
      <Link to="/cart" className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-ink">
        <Icon name="arrowLeft" size={16} /> Back to bag
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-8">
        <div>
          <p className="eyebrow">Checkout</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">Delivery & payment</h1>
        </div>
        <span className="badge badge-amber">Demonstration only</span>
      </div>

      <Notice tone="warning" className="mt-6" title="This checkout is a demo">
        It shows the flow but doesn't submit anything: no payment, no order, no shipment. Don't enter real card or bank details —
        none are asked for.
      </Notice>

      <form onSubmit={handleSubmit} className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="card p-5 sm:p-7">
            <h2 className="font-display text-2xl">Delivery address</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="label">
                Full name
                <input name="fullName" autoComplete="name" required maxLength={100} className="field mt-1.5 font-normal" />
              </label>
              <label className="label">
                Mobile number
                <input name="phone" type="tel" autoComplete="tel" inputMode="numeric" pattern="[0-9]{10}" title="Enter a 10-digit mobile number" required className="field mt-1.5 font-normal" />
              </label>
              <label className="label sm:col-span-2">
                Address
                <textarea name="address" autoComplete="street-address" required maxLength={300} rows={3} className="field mt-1.5 resize-y font-normal" />
              </label>
              <label className="label">
                City
                <input name="city" autoComplete="address-level2" required maxLength={80} className="field mt-1.5 font-normal" />
              </label>
              <label className="label">
                PIN code
                <input name="postalCode" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{6}" title="Enter a 6-digit PIN code" required className="field mt-1.5 font-normal" />
              </label>
            </div>
          </section>

          <fieldset className="card p-5 sm:p-7">
            <legend className="sr-only">Payment method</legend>
            <h2 className="font-display text-2xl" aria-hidden="true">
              Payment method
            </h2>
            <div className="mt-5 space-y-3">
              {PAYMENT_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-center gap-4 rounded-control border p-4 transition-colors ${
                    paymentMethod === option.id ? "border-ink bg-porcelain" : "border-line hover:border-sand"
                  }`}
                >
                  <input type="radio" name="payment" value={option.id} checked={paymentMethod === option.id} onChange={() => setPaymentMethod(option.id)} className="h-4 w-4" />
                  <span>
                    <span className="block font-semibold">{option.title}</span>
                    <span className="text-xs text-stone">{option.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <aside className="card p-6 lg:sticky lg:top-24" aria-label="Order summary">
          <h2 className="font-display text-2xl">Summary</h2>
          <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
            {items.map((item) => (
              <li key={`${item.productId}-${item.color}-${item.size}`} className="flex gap-3">
                <ProductImage src={item.imageUrl} alt="" className="h-16 w-12 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</p>
                  <p className="mt-0.5 text-xs text-stone">
                    {item.color} · {item.size} · ×{item.quantity}
                  </p>
                </div>
                <p className="shrink-0 text-sm tabular">{formatINR(item.price * item.quantity)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-semibold">Total</span>
            <span className="font-display text-3xl tabular">{formatINR(subtotal)}</span>
          </div>
          <button type="submit" className="btn btn-primary btn-lg mt-6 hidden w-full lg:inline-flex">
            Complete demo checkout
          </button>
          <p className="mt-3 text-center text-xs text-stone">No payment will be taken.</p>
        </aside>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] text-stone">Total (demo)</p>
              <p className="font-display text-2xl tabular">{formatINR(subtotal)}</p>
            </div>
            <button type="submit" className="btn btn-primary btn-lg flex-1 sm:flex-none sm:px-8">
              Complete demo
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
