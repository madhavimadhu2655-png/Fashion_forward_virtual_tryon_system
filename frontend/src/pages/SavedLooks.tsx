import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ProductImage from "../components/ProductImage";
import Icon from "../components/Icon";
import { EmptyPanel, Notice, SectionHeader, formatINR } from "../components/ui";
import { deleteSavedLook, fetchSavedLooks, renameSavedLook } from "../services/api";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../context/WishlistContext";
import type { SavedLook } from "../types/looks";

const SOURCE_LABEL: Record<string, string> = {
  browser_fit: "From a fit preview",
  catvton: "From an AI preview",
  live_camera: "From the live camera",
};

function LookCard({ look, onChange, onRemove }: { look: SavedLook; onChange: (look: SavedLook) => void; onRemove: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(look.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useToast();
  const title = look.label || look.product_name || look.product_id;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChange(await renameSavedLook(look.id, draft.trim() || null));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename this look.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteSavedLook(look.id);
      onRemove(look.id);
      notify("Look removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove this look.");
      setBusy(false);
    }
  }

  return (
    <article className="card flex gap-4 p-4 sm:p-5">
      <Link to={`/product/${look.product_id}`} className="shrink-0" tabIndex={-1} aria-hidden="true">
        <ProductImage src={look.product_thumbnail_url} alt="" className="h-36 w-28 rounded-control" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        {editing ? (
          <form onSubmit={save} className="flex gap-2">
            <label htmlFor={`label-${look.id}`} className="sr-only">
              Look name
            </label>
            <input id={`label-${look.id}`} className="field h-10" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} autoFocus placeholder="e.g. Brunch with Riya" />
            <button type="submit" className="btn btn-primary btn-sm h-10" disabled={busy}>
              Save
            </button>
            <button type="button" className="btn btn-quiet btn-sm h-10" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 font-display text-xl leading-snug">{title}</h2>
            <button type="button" className="icon-btn -mr-2 -mt-2 h-9 w-9 shrink-0" onClick={() => setEditing(true)} aria-label={`Rename ${title}`}>
              <Icon name="edit" size={16} />
            </button>
          </div>
        )}
        {look.label && <p className="mt-0.5 truncate text-sm text-stone">{look.product_name}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="h-3.5 w-3.5 rounded-full ring-1 ring-ink/15" style={{ backgroundColor: look.color_hex ?? undefined }} />
          {look.color_name}
          {look.product_price != null && <span className="text-stone">· {formatINR(look.product_price)}</span>}
        </p>
        <p className="mt-1 text-xs text-stone">
          Saved {new Date(look.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          {look.source && ` · ${SOURCE_LABEL[look.source] ?? look.source}`}
        </p>
        {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <Link to={`/studio?product=${look.product_id}&color=${encodeURIComponent(look.color_name)}`} className="btn btn-accent btn-sm">
            <Icon name="sparkle" size={14} /> Try again
          </Link>
          <Link to={`/product/${look.product_id}`} className="btn btn-ghost btn-sm">
            View product
          </Link>
          <button type="button" className="btn btn-quiet btn-sm" onClick={remove} disabled={busy}>
            <Icon name="trash" size={14} /> Remove
          </button>
        </div>
      </div>
    </article>
  );
}

export default function SavedLooks() {
  const [looks, setLooks] = useState<SavedLook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { productIds } = useWishlist();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchSavedLooks()
      .then((data) => !cancelled && setLooks(data))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load your saved looks."));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="page pb-16 pt-10 lg:pt-14">
      <SectionHeader
        as="h1"
        eyebrow="Your fitting room"
        title="Saved looks"
        lede="Product and colour combinations you want to revisit. Only these details are saved — never your photo or the generated image."
        action={
          <Link to="/wishlist" className="btn btn-ghost">
            <Icon name="heart" size={16} /> Favourites ({productIds.size})
          </Link>
        }
      />

      <Notice tone="info" className="mt-8">
        To keep a preview image, use Download in the studio — the copy goes to your device, not our servers.
      </Notice>

      <div className="mt-8">
        {error ? (
          <Notice tone="error" title="Couldn't load your saved looks" action={<button className="btn btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}>
            {error}
          </Notice>
        ) : looks === null ? (
          <div className="grid gap-5 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-44 rounded-card" />
            ))}
          </div>
        ) : looks.length === 0 ? (
          <EmptyPanel
            icon="bookmark"
            title="No saved looks yet"
            body="Generate a preview in the Try-On Studio and choose “Save look”, or save a colour from any product page."
            action={
              <>
                <Link to="/studio" className="btn btn-primary">
                  Open the studio
                </Link>
                <Link to="/shop" className="btn btn-ghost">
                  Browse tops
                </Link>
              </>
            }
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {looks.map((look) => (
              <LookCard
                key={look.id}
                look={look}
                onChange={(updated) => setLooks((current) => current?.map((l) => (l.id === updated.id ? updated : l)) ?? null)}
                onRemove={(id) => setLooks((current) => current?.filter((l) => l.id !== id) ?? null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
