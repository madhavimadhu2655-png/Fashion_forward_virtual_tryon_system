import { NavLink, useSearchParams } from "react-router-dom";
import Icon, { type IconName } from "../Icon";

const MODES: { to: string; label: string; icon: IconName }[] = [
  { to: "/studio", label: "Upload photo", icon: "upload" },
  { to: "/try-on", label: "Live camera", icon: "camera" },
  { to: "/compare", label: "Compare looks", icon: "compare" },
];

/** Shared heading + mode switch for the try-on studio pages. Keeps the selected product when switching. */
export default function StudioHeader({ title, lede }: { title: string; lede: string }) {
  const [params] = useSearchParams();
  const product = params.get("product");
  const color = params.get("color");
  const carry = product ? `?product=${product}${color ? `&color=${encodeURIComponent(color)}` : ""}` : "";

  return (
    <header className="border-b border-line pb-8">
      <p className="eyebrow">Try-On Studio</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
          <p className="lede mt-3">{lede}</p>
        </div>
        <nav aria-label="Try-on mode" className="flex rounded-full border border-line bg-porcelain p-1 shadow-soft">
          {MODES.map((mode) => (
            <NavLink
              key={mode.to}
              to={`${mode.to}${mode.to === "/compare" ? "" : carry}`}
              className={({ isActive }) =>
                `flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors sm:px-4 ${
                  isActive ? "bg-ink text-ivory" : "text-stone hover:text-ink"
                }`
              }
            >
              <Icon name={mode.icon} size={16} />
              <span className="hidden sm:inline">{mode.label}</span>
              <span className="sr-only sm:hidden">{mode.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
