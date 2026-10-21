import { describe, expect, it } from "vitest";
import { getPostAuthRedirect } from "./authRedirect";

describe("getPostAuthRedirect", () => {
  it("preserves the selected product query through authentication", () => {
    expect(getPostAuthRedirect({ from: "/try-on?product=CT001" })).toBe("/try-on?product=CT001");
  });

  it("uses the home route for invalid or external redirect targets", () => {
    expect(getPostAuthRedirect(null)).toBe("/");
    expect(getPostAuthRedirect({ from: "https://example.com" })).toBe("/");
    expect(getPostAuthRedirect({ from: "//example.com" })).toBe("/");
  });
});
