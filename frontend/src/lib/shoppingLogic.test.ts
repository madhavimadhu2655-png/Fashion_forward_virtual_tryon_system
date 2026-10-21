import { describe, expect, it } from "vitest";
import type { ProductListItem } from "../types/product";
import { answerQuestion } from "./assistant";
import { personalPicks, relatedProducts } from "./recommendations";
import { createSerialQueue } from "./serialQueue";

function product(id: string, overrides: Partial<ProductListItem> = {}): ProductListItem {
  return {
    id,
    name: `Top ${id}`,
    brand: "Brand",
    category: "Basic",
    price: 600,
    discount_price: null,
    fabric: "100% Cotton",
    fit_type: "Regular Fit",
    rating: 0,
    review_count: 0,
    is_trending: false,
    is_new: false,
    thumbnail_url: null,
    colors: [{ color_name: "Black", color_hex: "#111111", image_url: null, stock: 0 }],
    ...overrides,
  };
}

const catalogue = [
  product("A", { name: "Ribbed Square Neck Crop Top", category: "Ribbed", fabric: "95% Cotton, 5% Elastane", fit_type: "Slim Fit", price: 799, discount_price: 599, colors: [{ color_name: "Black", color_hex: "#111", image_url: null, stock: 0 }, { color_name: "Pink", color_hex: "#f4b", image_url: null, stock: 0 }] }),
  product("B", { name: "Sequin Party Crop Top", category: "Party", fabric: "Polyester Sequin", fit_type: "Fitted", price: 1299, discount_price: 999, colors: [{ color_name: "Gold", color_hex: "#d90", image_url: null, stock: 0 }] }),
  product("C", { name: "Performance Sports Crop Top", category: "Sports", fabric: "Polyester Spandex", fit_type: "Compression Fit", price: 999, colors: [{ color_name: "Blue", color_hex: "#25e", image_url: null, stock: 0 }] }),
  product("D", { name: "Tie-Front Denim Crop Top", category: "Denim", fabric: "Cotton Denim", fit_type: "Fitted", price: 1099, colors: [{ color_name: "Light Blue", color_hex: "#9cf", image_url: null, stock: 0 }] }),
  product("E", { name: "Ribbed Halter Crop Top", category: "Ribbed", fabric: "Ribbed Cotton Blend", fit_type: "Slim Fit", price: 849, colors: [{ color_name: "Pink", color_hex: "#f4b", image_url: null, stock: 0 }] }),
];

describe("recommendations", () => {
  it("ranks products sharing real attributes highest and never includes the target", () => {
    const related = relatedProducts(catalogue[0], catalogue, 2);
    expect(related.map((r) => r.product.id)).toEqual(["E", "D"]);
    expect(related[0].reasons).toContain("Also ribbed");
    expect(related.every((r) => r.product.id !== "A")).toBe(true);
  });

  it("builds personal picks from viewed items and excludes them", () => {
    const picks = personalPicks(["B"], catalogue, 2);
    expect(picks.map((p) => p.product.id)).not.toContain("B");
    expect(personalPicks([], catalogue)).toEqual([]);
  });
});

describe("answerQuestion", () => {
  it("filters by colour and max price", () => {
    const answer = answerQuestion("pink tops under 700", catalogue);
    expect(answer.products.map((p) => p.id)).toEqual(["A"]);
    expect(answer.understood).toEqual(["colour: Pink", "price: up to ₹700"]);
  });

  it("maps occasions to real categories", () => {
    expect(answerQuestion("something for the gym", catalogue).products.map((p) => p.id)).toEqual(["C"]);
    expect(answerQuestion("a party top", catalogue).products.map((p) => p.id)).toEqual(["B"]);
  });

  it("prefers the most specific colour name", () => {
    expect(answerQuestion("light blue", catalogue).products.map((p) => p.id)).toEqual(["D"]);
  });

  it("answers colour availability for a named product", () => {
    expect(answerQuestion("What colours does the Ribbed Square Neck Crop Top come in?", catalogue).text).toBe(
      "Ribbed Square Neck Crop Top is listed in Black, Pink.",
    );
  });

  it("sorts, handles sale and admits when it can't help", () => {
    expect(answerQuestion("cheapest denim", catalogue).products[0].id).toBe("D");
    expect(answerQuestion("on sale", catalogue).products.map((p) => p.id)).toEqual(["A", "B"]);
    expect(answerQuestion("tell me a joke", catalogue).products).toEqual([]);
    expect(answerQuestion("gold under 100", catalogue).text).toContain("Nothing");
    expect(answerQuestion("black", []).text).toContain("hasn't loaded");
  });
});

describe("createSerialQueue", () => {
  it("never runs two jobs at once and keeps order", async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    let running = 0;
    const job = (name: string, ms: number) => async () => {
      running++;
      expect(running).toBe(1);
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      running--;
      return name;
    };
    const a = queue.enqueue("a", job("a", 15));
    const b = queue.enqueue("b", job("b", 1));
    expect(await Promise.all([a.promise, b.promise])).toEqual(["a", "b"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("skips a job cancelled before it starts, and a failure doesn't stall the queue", async () => {
    const queue = createSerialQueue();
    const fail = queue.enqueue("x", async () => {
      throw new Error("boom");
    });
    const skipped = queue.enqueue("y", async () => "ran");
    skipped.cancel();
    const after = queue.enqueue("z", async () => "z");
    await expect(fail.promise).rejects.toThrow("boom");
    await expect(skipped.promise).rejects.toThrow("Cancelled");
    expect(await after.promise).toBe("z");
  });
});
