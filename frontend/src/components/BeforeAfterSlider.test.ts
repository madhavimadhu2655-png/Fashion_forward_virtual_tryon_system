import { describe, expect, it } from "vitest";
import { clampPosition, keyToPosition } from "./BeforeAfterSlider";

describe("before/after slider keyboard model", () => {
  it("steps by 2, or 10 with Shift, and clamps to 0–100", () => {
    expect(keyToPosition("ArrowRight", 50, false)).toBe(52);
    expect(keyToPosition("ArrowLeft", 50, true)).toBe(40);
    expect(keyToPosition("ArrowLeft", 1, false)).toBe(0);
    expect(keyToPosition("ArrowUp", 99, true)).toBe(100);
  });

  it("supports Home, End and paging, and ignores other keys", () => {
    expect(keyToPosition("Home", 63, false)).toBe(0);
    expect(keyToPosition("End", 63, false)).toBe(100);
    expect(keyToPosition("PageDown", 63, false)).toBe(53);
    expect(keyToPosition("a", 63, false)).toBeNull();
    expect(clampPosition(-5)).toBe(0);
  });
});
