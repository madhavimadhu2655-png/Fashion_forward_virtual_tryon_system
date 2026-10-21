import { useEffect, useState } from "react";
import { fetchProducts } from "../services/api";
import type { ProductListItem } from "../types/product";

// The whole catalogue is small (20 products), so it is fetched once per
// session and shared — this avoids repeating the same request on every page.
let cache: ProductListItem[] | null = null;
let inflight: Promise<ProductListItem[]> | null = null;

function load(): Promise<ProductListItem[]> {
  if (cache) return Promise.resolve(cache);
  inflight ??= fetchProducts({ limit: 100, sort: "newest" })
    .then((res) => {
      cache = res.items;
      return res.items;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useCatalogue() {
  const [items, setItems] = useState<ProductListItem[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "The catalogue couldn't be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return {
    items,
    loading,
    error,
    retry: () => {
      setLoading(true);
      setAttempt((n) => n + 1);
    },
    byId: (id: string | null | undefined) => (id ? items.find((p) => p.id === id) ?? null : null),
  };
}
