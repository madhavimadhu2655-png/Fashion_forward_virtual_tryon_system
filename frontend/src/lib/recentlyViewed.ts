// Recently viewed product ids — a per-browser convenience only (ids, never
// images). Storage can be unavailable (private mode, blocked site data),
// so every access is guarded and the app works without it.
const KEY = "ff_recently_viewed";
const LIMIT = 12;

export function readRecentlyViewed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(productId: string): string[] {
  const next = [productId, ...readRecentlyViewed().filter((id) => id !== productId)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — the list simply won't persist
  }
  return next;
}

export function clearRecentlyViewed(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
