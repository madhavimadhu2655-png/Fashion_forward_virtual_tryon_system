import type { ProductListItem } from "../types/product";

/**
 * A small, deterministic shopping assistant. It parses a question into
 * filters (colour, category, fabric, fit, price, occasion) and answers
 * ONLY from catalogue data. It runs entirely in the browser — no AI
 * service, no network call — and says so when it can't answer.
 */

export interface AssistantAnswer {
  text: string;
  products: ProductListItem[];
  /** Filters understood from the question, shown so the logic is transparent. */
  understood: string[];
}

const OCCASIONS: Record<string, string[]> = {
  party: ["Party"],
  evening: ["Party"],
  festive: ["Party"],
  gym: ["Sports"],
  workout: ["Sports"],
  running: ["Sports"],
  yoga: ["Sports"],
  sport: ["Sports"],
  everyday: ["Basic", "Casual", "Tank", "Ribbed"],
  casual: ["Casual", "Basic", "Tank"],
  office: ["Full-Sleeve", "Basic"],
  winter: ["Knitted", "Full-Sleeve"],
  cold: ["Knitted", "Full-Sleeve"],
  summer: ["Tank", "Printed", "Halter", "Casual"],
  beach: ["Halter", "Printed", "Tank"],
};

const FABRIC_WORDS = ["cotton", "linen", "rayon", "denim", "knit", "sequin", "polyester", "viscose", "jersey", "lycra", "ribbed", "spandex", "poplin"];
const FIT_WORDS: Record<string, string> = {
  slim: "Slim Fit",
  relaxed: "Relaxed Fit",
  loose: "Relaxed Fit",
  oversized: "Relaxed Fit",
  regular: "Regular Fit",
  fitted: "Fitted",
  tight: "Fitted",
  compression: "Compression Fit",
};

const price = (p: ProductListItem) => p.discount_price ?? p.price;
const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`;

function priceBounds(q: string): { min?: number; max?: number; label?: string } {
  const between = /between\s*₹?\s*(\d{2,5})\s*(?:and|-|to)\s*₹?\s*(\d{2,5})/.exec(q);
  if (between) {
    const [a, b] = [Number(between[1]), Number(between[2])].sort((x, y) => x - y);
    return { min: a, max: b, label: `${inr(a)}–${inr(b)}` };
  }
  const under = /(?:under|below|less than|cheaper than|max(?:imum)?|upto|up to|within|<)\s*₹?\s*(\d{2,5})/.exec(q);
  if (under) return { max: Number(under[1]), label: `up to ${inr(Number(under[1]))}` };
  const over = /(?:over|above|more than|at least|min(?:imum)?|>)\s*₹?\s*(\d{2,5})/.exec(q);
  if (over) return { min: Number(over[1]), label: `from ${inr(Number(over[1]))}` };
  return {};
}

export function answerQuestion(question: string, catalogue: ProductListItem[]): AssistantAnswer {
  const q = question.toLowerCase().trim();
  const understood: string[] = [];
  if (!q) return { text: "Ask me about colours, styles, fabrics, fit or price.", products: [], understood };
  if (catalogue.length === 0) {
    return { text: "The catalogue hasn't loaded yet, so I can't answer. Check that the backend is running.", products: [], understood };
  }

  // "What colours does <product> come in?"
  if (/colou?rs?|shades?/.test(q) && /(come in|available|options|does|which)/.test(q)) {
    const named = catalogue.find((p) => q.includes(p.name.toLowerCase()) || q.includes(p.id.toLowerCase()));
    if (named) {
      return {
        text: `${named.name} is listed in ${named.colors.map((c) => c.color_name).join(", ")}.`,
        products: [named],
        understood: [named.name],
      };
    }
  }

  let results = [...catalogue];

  const colorNames = [...new Set(catalogue.flatMap((p) => p.colors.map((c) => c.color_name)))].sort((a, b) => b.length - a.length);
  const wantedColors = colorNames.filter((c) => new RegExp(`\\b${c.toLowerCase()}\\b`).test(q));
  // "Light Blue" also contains "blue" — keep only the most specific matches.
  const colors = wantedColors.filter((c) => !wantedColors.some((o) => o !== c && o.toLowerCase().includes(c.toLowerCase())));
  if (colors.length) {
    results = results.filter((p) => p.colors.some((c) => colors.includes(c.color_name)));
    understood.push(`colour: ${colors.join(" or ")}`);
  }

  const categories = [...new Set(catalogue.map((p) => p.category))];
  const wantedCategories = new Set(
    categories.filter((c) => q.includes(c.toLowerCase()) || q.includes(c.toLowerCase().replace("-", " "))),
  );
  if (/long sleeve|full sleeve|sleeves/.test(q) && categories.includes("Full-Sleeve")) wantedCategories.add("Full-Sleeve");
  for (const [word, mapped] of Object.entries(OCCASIONS)) {
    if (new RegExp(`\\b${word}`).test(q)) {
      mapped.filter((c) => categories.includes(c)).forEach((c) => wantedCategories.add(c));
      understood.push(`occasion: ${word}`);
    }
  }
  if (wantedCategories.size) {
    results = results.filter((p) => wantedCategories.has(p.category));
    understood.push(`style: ${[...wantedCategories].join(", ")}`);
  }

  const fabrics = FABRIC_WORDS.filter((f) => q.includes(f));
  if (fabrics.length) {
    results = results.filter((p) => fabrics.some((f) => `${p.fabric ?? ""} ${p.name}`.toLowerCase().includes(f)));
    understood.push(`fabric: ${fabrics.join(", ")}`);
  }

  const fit = Object.entries(FIT_WORDS).find(([word]) => new RegExp(`\\b${word}\\b`).test(q));
  if (fit) {
    results = results.filter((p) => p.fit_type === fit[1]);
    understood.push(`fit: ${fit[1]}`);
  }

  const bounds = priceBounds(q);
  if (bounds.label) {
    results = results.filter((p) => (bounds.min === undefined || price(p) >= bounds.min) && (bounds.max === undefined || price(p) <= bounds.max));
    understood.push(`price: ${bounds.label}`);
  }
  if (/on sale|discount|offer|deal/.test(q)) {
    results = results.filter((p) => p.discount_price !== null && p.discount_price < p.price);
    understood.push("reduced price");
  }

  if (/cheapest|lowest price|most affordable|budget/.test(q)) {
    results.sort((a, b) => price(a) - price(b));
    understood.push("sorted by lowest price");
  } else if (/most expensive|priciest|premium|highest price/.test(q)) {
    results.sort((a, b) => price(b) - price(a));
    understood.push("sorted by highest price");
  }

  if (understood.length === 0) {
    return {
      text: "I can only answer from the product catalogue. Try something like “black tops under ₹800”, “something for the gym” or “what colours does the Halter Neck Crop Top come in?”.",
      products: [],
      understood,
    };
  }
  if (results.length === 0) {
    return { text: "Nothing in the catalogue matches all of that. Try removing one condition.", products: [], understood };
  }
  const shown = results.slice(0, 6);
  const low = Math.min(...results.map(price));
  const high = Math.max(...results.map(price));
  return {
    text: `${results.length} ${results.length === 1 ? "top matches" : "tops match"}${
      results.length > 1 ? `, from ${inr(low)} to ${inr(high)}` : ` at ${inr(low)}`
    }.${results.length > shown.length ? ` Showing the first ${shown.length}.` : ""}`,
    products: shown,
    understood,
  };
}
