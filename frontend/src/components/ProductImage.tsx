import { useState } from "react";
import { resolveAssetUrl } from "../services/api";
import Icon from "./Icon";

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Load immediately (above the fold) instead of lazily. */
  eager?: boolean;
  fit?: "cover" | "contain";
}

/**
 * A real catalogue photo from the backend. If the file is missing it shows
 * a quiet "photo not added yet" state instead of a broken image — it never
 * substitutes another product's photo.
 */
export default function ProductImage({ src, alt, className = "", eager = false, fit = "cover" }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const resolved = resolveAssetUrl(src);

  if (!resolved || failed) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-canvas px-3 text-center text-xs text-stone ${className}`}>
        <Icon name="image" size={24} />
        <span>Photo not added yet</span>
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      className={`${fit === "cover" ? "object-cover" : "object-contain"} bg-canvas transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}
