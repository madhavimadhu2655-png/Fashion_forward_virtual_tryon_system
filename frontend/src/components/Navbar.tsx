import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { useAuth } from "../context/AuthContext";
import Icon from "./Icon";

const NAV = [
  { to: "/shop", label: "Shop" },
  { to: "/studio", label: "Try-On Studio", match: ["/studio", "/try-on", "/photo-try-on"] },
  { to: "/compare", label: "Compare" },
  { to: "/rooms", label: "Shop Together" },
];

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-wine px-1 text-[10px] font-bold text-ivory tabular">
      {n}
    </span>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex shrink-0 items-baseline gap-1.5" aria-label="Fashion Forward home">
      <span className={`font-display text-[1.45rem] font-normal italic leading-none tracking-tight ${light ? "text-ivory" : "text-ink"}`}>
        Fashion
      </span>
      <span className={`text-[0.72rem] font-semibold uppercase tracking-[0.32em] ${light ? "text-ivory/80" : "text-ink"}`}>
        Forward
      </span>
    </Link>
  );
}

export default function Navbar() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount } = useCart();
  const { productIds } = useWishlist();
  const { user, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    setMenuOpen(false);
    setAcctOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!acctOpen) return;
    function onDown(e: MouseEvent) {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAcctOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [acctOpen]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(query.trim() ? `/shop?q=${encodeURIComponent(query.trim())}` : "/shop");
    setMenuOpen(false);
    setSearchOpen(false);
  }

  const isActive = (item: (typeof NAV)[number]) =>
    (item.match ?? [item.to]).some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const firstName = user?.full_name.split(" ")[0] ?? "";

  const accountLinks = [
    { to: "/saved-looks", label: "Saved looks" },
    { to: "/profile", label: "Profile & measurements" },
    { to: "/orders", label: "Orders" },
    ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ivory/90 backdrop-blur-md">
      <div className="page flex h-16 items-center gap-6">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                isActive(item) ? "text-ink" : "text-stone hover:text-ink"
              }`}
              aria-current={isActive(item) ? "page" : undefined}
            >
              {item.label}
              {isActive(item) && <span className="absolute inset-x-3 -bottom-[13px] h-[2px] bg-wine" aria-hidden="true" />}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-0.5">
          <form onSubmit={handleSearch} role="search" className={`relative ${searchOpen ? "block" : "hidden"} md:block`}>
            <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search crop tops"
              aria-label="Search crop tops"
              className="field h-10 w-44 rounded-full border-line bg-porcelain/70 pl-10 lg:w-56"
            />
          </form>
          <button type="button" className="icon-btn md:hidden" aria-label="Search" onClick={() => setSearchOpen((v) => !v)}>
            <Icon name="search" />
          </button>
          <Link to="/wishlist" aria-label={`Favourites, ${productIds.size} saved`} className="icon-btn relative">
            <Icon name="heart" />
            <CountBadge n={productIds.size} />
          </Link>
          <Link to="/cart" aria-label={`Bag, ${itemCount} items`} className="icon-btn relative">
            <Icon name="bag" />
            <CountBadge n={itemCount} />
          </Link>

          <div className="hidden pl-2 lg:block">
            {isAuthenticated ? (
              <div className="relative" ref={acctRef}>
                <button
                  type="button"
                  onClick={() => setAcctOpen((v) => !v)}
                  aria-expanded={acctOpen}
                  aria-haspopup="menu"
                  className="flex h-10 items-center gap-2 rounded-full border border-line bg-porcelain pl-1.5 pr-3.5 text-sm font-medium transition-colors hover:border-sand"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-wine-soft text-xs font-semibold text-wine">
                    {firstName.charAt(0).toUpperCase()}
                  </span>
                  {firstName}
                  <Icon name="chevronDown" size={14} />
                </button>
                {acctOpen && (
                  <div role="menu" className="sheet-up absolute right-0 mt-2 w-56 overflow-hidden rounded-card border border-line bg-porcelain p-1.5 shadow-lift">
                    {accountLinks.map((item) => (
                      <Link key={item.to} to={item.to} role="menuitem" className="block rounded-control px-3.5 py-2.5 text-sm text-ink-soft hover:bg-canvas hover:text-ink">
                        {item.label}
                      </Link>
                    ))}
                    <div className="my-1 h-px bg-line" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => logout()}
                      className="flex w-full items-center gap-2 rounded-control px-3.5 py-2.5 text-left text-sm text-danger hover:bg-danger-soft"
                    >
                      <Icon name="logout" size={16} /> Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Link to="/login" className="btn btn-quiet btn-sm">
                  Log in
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm">
                  Join
                </Link>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="icon-btn lg:hidden"
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className="sheet-up fixed inset-x-0 bottom-0 top-16 z-20 overflow-y-auto bg-ivory px-5 pb-10 pt-4 lg:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {[...NAV, { to: "/wishlist", label: "Favourites" }, { to: "/cart", label: "Bag" }, ...(isAuthenticated ? accountLinks : [])].map(
              (item) => (
                <Link key={item.to} to={item.to} className="flex items-center justify-between border-b border-line py-4 font-display text-2xl text-ink">
                  {item.label}
                  <Icon name="chevronRight" size={18} className="text-stone" />
                </Link>
              ),
            )}
          </nav>
          <div className="mt-8 flex flex-col gap-3">
            {isAuthenticated ? (
              <>
                <p className="text-sm text-stone">Signed in as {user?.full_name}</p>
                <button type="button" onClick={() => logout()} className="btn btn-ghost">
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary">
                  Create account
                </Link>
                <Link to="/login" className="btn btn-ghost">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
