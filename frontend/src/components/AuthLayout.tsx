import type { ReactNode } from "react";
import ProductImage from "./ProductImage";
import { useCatalogue } from "../hooks/useCatalogue";

/** Split layout for login/register: form on one side, a real catalogue photo on the other. */
export default function AuthLayout({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  const { byId, items } = useCatalogue();
  const feature = byId("CT012") ?? items[0] ?? null;
  return (
    <div className="page grid min-h-[78vh] items-center gap-10 py-10 lg:grid-cols-2 lg:gap-16 lg:py-16">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-4xl sm:text-5xl">{title}</h1>
        <p className="lede mt-3">{lede}</p>
        <div className="mt-8">{children}</div>
      </div>
      <div className="relative hidden overflow-hidden rounded-card bg-canvas lg:block">
        <ProductImage src={feature?.thumbnail_url} alt="" eager className="aspect-[4/5] w-full" />
        {feature && (
          <p className="absolute bottom-5 left-5 rounded-full bg-porcelain/95 px-4 py-2 text-xs font-medium shadow-soft">{feature.name}</p>
        )}
      </div>
    </div>
  );
}
