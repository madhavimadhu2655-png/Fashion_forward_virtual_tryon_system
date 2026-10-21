import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { addWishlistItem, fetchWishlist, mergeWishlist, removeWishlistItem } from "../services/api";

interface WishlistContextValue {
  productIds: Set<string>;
  toggle: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  /** True while favourites are only in this tab (signed out). */
  guest: boolean;
  syncError: string | null;
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined);

/**
 * Favourites. Signed out: kept in memory for this tab (as before).
 * Signed in: stored per user on the backend; anything picked while signed
 * out is merged into the account on login. Updates are optimistic and
 * rolled back if the server rejects them.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [productIds, setProductIds] = useState<Set<string>>(new Set());
  const [syncError, setSyncError] = useState<string | null>(null);
  const guestIdsRef = useRef<Set<string>>(new Set());
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isAuthenticated) {
      setProductIds(new Set(guestIdsRef.current));
      return;
    }
    let cancelled = false;
    const pending = [...guestIdsRef.current];
    const load = pending.length ? mergeWishlist(pending) : fetchWishlist();
    load
      .then((ids) => {
        if (cancelled) return;
        guestIdsRef.current = new Set();
        setProductIds(new Set(ids));
        setSyncError(null);
      })
      .catch(() => {
        if (!cancelled) setSyncError("Couldn't load your favourites. They'll appear once the connection returns.");
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId]);

  const toggle = useCallback(
    (productId: string) => {
      setProductIds((prev) => {
        const next = new Set(prev);
        const adding = !next.has(productId);
        if (adding) next.add(productId);
        else next.delete(productId);

        if (!isAuthenticated) {
          guestIdsRef.current = new Set(next);
          return next;
        }
        (adding ? addWishlistItem(productId) : removeWishlistItem(productId))
          .then((ids) => {
            setProductIds(new Set(ids));
            setSyncError(null);
          })
          .catch(() => {
            setProductIds((current) => {
              const rolledBack = new Set(current);
              if (adding) rolledBack.delete(productId);
              else rolledBack.add(productId);
              return rolledBack;
            });
            setSyncError("That favourite couldn't be saved. Please try again.");
          });
        return next;
      });
    },
    [isAuthenticated],
  );

  const isWishlisted = useCallback((productId: string) => productIds.has(productId), [productIds]);

  return (
    <WishlistContext.Provider value={{ productIds, toggle, isWishlisted, guest: !isAuthenticated, syncError }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within a WishlistProvider");
  return ctx;
}
