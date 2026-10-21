import type { ProductListItem } from "../types/product";

/**
 * Content-based recommendations from real catalogue attributes only
 * (category, fabric, fit, colours, price). No popularity, ratings or
 * purchase data are used — the catalogue's seeded rating/review numbers
 * are demo values and are deliberately ignored.
 */

const effectivePrice = (p: ProductListItem) => p.discount_price ?? p.price;

const words = (value: string | undefined) =>
  new Set(
    (value ?? "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !["fit", "blend", "the"].includes(w)),
  );

export interface Reason {
  score: number;
  reasons: string[];
}

export function similarity(a: ProductListItem, b: ProductListItem): Reason {
  let score = 0;
  const reasons: string[] = [];
  if (a.category === b.category) {
    score += 3;
    reasons.push(`Also ${a.category.toLowerCase()}`);
  }
  const fabricA = words(a.fabric);
  const sharedFabric = [...words(b.fabric)].filter((w) => fabricA.has(w));
  if (sharedFabric.length) {
    score += 2;
    reasons.push(`Similar fabric (${sharedFabric[0]})`);
  }
  if (a.fit_type && a.fit_type === b.fit_type) {
    score += 1.5;
    reasons.push(a.fit_type);
  }
  const colorsA = new Set(a.colors.map((c) => c.color_name.toLowerCase()));
  const sharedColors = b.colors.filter((c) => colorsA.has(c.color_name.toLowerCase()));
  if (sharedColors.length) {
    score += Math.min(2, sharedColors.length);
    reasons.push(`Comes in ${sharedColors[0].color_name.toLowerCase()}`);
  }
  const priceA = effectivePrice(a);
  const priceGap = Math.abs(priceA - effectivePrice(b)) / Math.max(priceA, 1);
  score += Math.max(0, 1 - priceGap);
  if (priceGap <= 0.15) reasons.push("Similar price");
  return { score, reasons };
}

export function relatedProducts(target: ProductListItem, catalogue: ProductListItem[], count = 4) {
  return catalogue
    .filter((p) => p.id !== target.id)
    .map((p) => ({ product: p, ...similarity(target, p) }))
    .sort((x, y) => y.score - x.score || x.product.id.localeCompare(y.product.id))
    .slice(0, count);
}

/** Picks for someone based on products they looked at or favourited. */
export function personalPicks(seedIds: string[], catalogue: ProductListItem[], count = 4) {
  const byId = new Map(catalogue.map((p) => [p.id, p]));
  const seeds = seedIds.map((id) => byId.get(id)).filter((p): p is ProductListItem => Boolean(p));
  if (seeds.length === 0) return [];
  const seen = new Set(seedIds);
  return catalogue
    .filter((p) => !seen.has(p.id))
    .map((p) => {
      const matches = seeds.map((seed) => similarity(seed, p));
      const best = matches.reduce((a, b) => (b.score > a.score ? b : a));
      return { product: p, score: matches.reduce((sum, m) => sum + m.score, 0) / seeds.length, reasons: best.reasons };
    })
    .sort((x, y) => y.score - x.score || x.product.id.localeCompare(y.product.id))
    .slice(0, count);
}
