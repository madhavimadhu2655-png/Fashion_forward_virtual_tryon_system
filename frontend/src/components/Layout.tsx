import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import AssistantWidget from "./AssistantWidget";
import { Spinner } from "./ui";

export default function Layout() {
  const { pathname } = useLocation();

  // New page → start at the top (but leave in-page anchors alone).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-ivory">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-ivory"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="page py-24 text-center text-sm text-stone">
              <Spinner label="Loading…" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <AssistantWidget />
    </div>
  );
}
