import type { TryOnResult } from "../context/TryOnSessionContext";

/** Honest label for a generated image: which engine, and whether it was recoloured. */
export function resultLabel(result: Pick<TryOnResult, "engine" | "tinted">) {
  return result.engine === "catvton" ? "AI generated" : result.tinted ? "Fit preview · recoloured" : "Fit preview";
}

/** Saves a copy to the user's device. This is the only way an image leaves the page. */
export function downloadResult(result: TryOnResult) {
  const link = document.createElement("a");
  link.href = result.url;
  link.download = `fashion-forward-${result.productId}-${result.colorName.toLowerCase().replace(/\s+/g, "-")}.png`;
  link.click();
}

/** Plain-language version of fitting-pipeline warnings for shoppers. */
export function friendlyWarning(warning: string | null): string | null {
  if (!warning) return null;
  if (/TPS deformation was reduced/i.test(warning)) {
    return "Your pose needed a strong bend, so the garment was kept a little stiffer to avoid distorting it. Standing straighter gives a closer fit.";
  }
  return warning;
}
