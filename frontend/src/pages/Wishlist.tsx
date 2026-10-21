import { Link } from "react-router-dom";
import { useWishlist } from "../context/WishlistContext";
import { useAuth } from "../context/AuthContext";
import { useCatalogue } from "../hooks/useCatalogue";
import ProductCard, { ProductCardSkeleton } from "../components/ProductCard";
import EmptyState from "../components/EmptyState";
import { Notice, SectionHeader } from "../components/ui";

export default function Wishlist() {
  const { productIds, guest, syncError } = useWishlist();
  const { isAuthenticated } = useAuth();
  const { items: catalogue, loading, error } = useCatalogue();
  const items = catalogue.filter((p) => productIds.has(p.id));

  if (!loading && !error && items.length === 0) {
    return <EmptyState icon="heart" title="No favourites yet" body="Tap the heart on any crop top to keep it here." cta={{ to: "/shop", label: "Browse crop tops" }} />;
  }

  return (
    <div className="page pb-16 pt-10 lg:pt-14">
      <SectionHeader
        as="h1"
        eyebrow="Favourites"
        title={`${productIds.size} saved ${productIds.size === 1 ? "top" : "tops"}`}
        action={
          isAuthenticated && (
            <Link to="/saved-looks" className="btn btn-ghost">
              Saved looks
            </Link>
          )
        }
      />
      {guest && (
        <Notice tone="info" className="mt-6" action={<Link to="/login" state={{ from: "/wishlist" }} className="btn btn-ghost btn-sm">Log in to keep them</Link>}>
          You're not signed in, so these favourites last only for this tab. Sign in and they'll be saved to your account.
        </Notice>
      )}
      {(syncError || error) && (
        <Notice tone="error" className="mt-6">
          {syncError ?? error}
        </Notice>
      )}
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
        {loading ? [0, 1, 2, 3].map((i) => <ProductCardSkeleton key={i} />) : items.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
}
