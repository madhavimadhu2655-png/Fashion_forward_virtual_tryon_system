import { Link } from "react-router-dom";
import { Logo } from "./Navbar";
import Icon from "./Icon";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { to: "/shop", label: "All crop tops" },
      { to: "/wishlist", label: "Favourites" },
      { to: "/cart", label: "Bag" },
    ],
  },
  {
    title: "Try on",
    links: [
      { to: "/studio", label: "Photo try-on" },
      { to: "/try-on", label: "Live camera" },
      { to: "/compare", label: "Compare looks" },
      { to: "/rooms", label: "Shop together" },
    ],
  },
  {
    title: "About",
    links: [
      { to: "/demo", label: "Demo guide & system status" },
      { to: "/saved-looks", label: "Saved looks" },
      { to: "/profile", label: "Account" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-24 bg-ink text-ivory/80">
      <div className="page grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo light />
          <p className="mt-5 max-w-sm font-display text-2xl leading-snug text-ivory">
            See it on you before it's yours.
          </p>
          <p className="mt-5 flex max-w-sm gap-2.5 text-sm leading-6 text-ivory/65">
            <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-blush" />
            Photos and generated previews stay in your browser's memory. We don't store them — download a copy if you
            want to keep one.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title} className="md:col-span-2">
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-eyebrow text-ivory/50">{column.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-ivory/80 transition-colors hover:text-ivory">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ivory/10">
        <div className="page flex flex-col gap-2 py-6 text-xs text-ivory/50 sm:flex-row sm:items-center sm:justify-between">
          <p>Fashion Forward — AI-powered AR crop top virtual try-on. Academic project.</p>
          <p>Checkout is a demonstration; no payments are processed.</p>
        </div>
      </div>
    </footer>
  );
}
