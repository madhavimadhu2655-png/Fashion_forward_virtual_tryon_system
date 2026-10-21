import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchHealth, fetchPhotoTryOnCatalog, type PhotoTryOnProduct } from "../services/api";
import { useCatalogue } from "../hooks/useCatalogue";
import { useAiStatus } from "../hooks/useTryOnData";
import { AiStatusChecklist } from "../components/studio/EnginePicker";
import { getQualityLandmarker } from "../lib/mediapipe";
import Icon from "../components/Icon";
import { SectionHeader } from "../components/ui";

type State = "checking" | "ok" | "warn" | "error";

function Row({ label, state, detail }: { label: string; state: State; detail: string }) {
  const tone = { checking: "bg-sand animate-pulse", ok: "bg-sage", warn: "bg-amber", error: "bg-danger" }[state];
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3.5 last:border-b-0">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2 text-right text-sm text-stone">
        {detail}
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
        <span className="sr-only">{state}</span>
      </span>
    </div>
  );
}

const DEMO_STEPS: { to: string; title: string; body: string }[] = [
  { to: "/", title: "Home", body: "Editorial landing page built from the real catalogue — real photos and prices only." },
  { to: "/shop", title: "Shop & filters", body: "Search, filter by style, colour swatch, price, size, fabric and fit; sort; clear filters." },
  { to: "/product/CT001", title: "Product page", body: "Front/side/back gallery, colours, sizes, and which colours have an exact try-on reference." },
  { to: "/try-on?product=CT001", title: "Live camera", body: "Real-time MediaPipe pose tracking with a thin-plate-spline garment warp and arm layering." },
  { to: "/studio?product=CT001&color=Black", title: "Photo try-on", body: "Upload a photo: quality check, consent, generate, then drag the before-and-after slider." },
  { to: "/compare?add=CT001:Black", title: "Compare looks", body: "Add 2–3 tops; results are generated one at a time on the same photo." },
  { to: "/saved-looks", title: "Saved looks", body: "Save, rename and revisit product/colour picks — metadata only, never images." },
  { to: "/rooms", title: "Shop Together", body: "Open a room, join from a second browser with another account, pick, chat, heart and vote." },
];

const REALITY: [string, string][] = [
  ["Live camera try-on", "Real — runs in the browser (needs a camera and the MediaPipe CDN)"],
  ["Browser fit preview", "Real — geometric warp of the product cutout; labelled when a colour is recoloured"],
  ["AI generation (CatVTON)", "Real when a local NVIDIA GPU worker is running; otherwise clearly unavailable"],
  ["Photo quality checks", "Real — heuristic thresholds, not validated on a labelled dataset"],
  ["Favourites & saved looks", "Real — stored per account in PostgreSQL (metadata only)"],
  ["Shop Together", "Real — FastAPI WebSockets; single backend process"],
  ["Catalogue assistant", "Real — rule-based over catalogue data, no AI service"],
  ["Checkout & payment", "Demo only — no order, payment or delivery"],
  ["Ratings, reviews, stock", "Not shown — the seed values are placeholders"],
];

export default function Status() {
  const [backend, setBackend] = useState<State>("checking");
  const [db, setDb] = useState<State>("checking");
  const [refs, setRefs] = useState<PhotoTryOnProduct[] | null>(null);
  const [pose, setPose] = useState<State | "idle">("idle");
  const catalogue = useCatalogue();
  const ai = useAiStatus(true);

  useEffect(() => {
    fetchHealth()
      .then((data) => {
        setBackend("ok");
        setDb(data.database === "connected" ? "ok" : "error");
      })
      .catch(() => {
        setBackend("error");
        setDb("error");
      });
    fetchPhotoTryOnCatalog()
      .then((data) => setRefs(data.items))
      .catch(() => setRefs([]));
  }, []);

  const colourCount = refs?.reduce((n, p) => n + p.colors.length, 0) ?? 0;
  const exactCount = refs?.reduce((n, p) => n + p.colors.filter((c) => c.image_available).length, 0) ?? 0;
  const camera = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  async function testPose() {
    setPose("checking");
    try {
      await getQualityLandmarker();
      setPose("ok");
    } catch {
      setPose("error");
    }
  }

  return (
    <div className="page pb-16 pt-10 lg:pt-14">
      <SectionHeader
        as="h1"
        eyebrow="For reviewers"
        title="System status & demo guide"
        lede="Live checks of every component, a suggested walkthrough, and an honest list of what is real versus demonstration."
      />

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-display text-2xl">Services</h2>
          <div className="mt-3">
            <Row label="Frontend" state="ok" detail="Running" />
            <Row label="Backend API" state={backend} detail={backend === "ok" ? "Reachable" : backend === "error" ? "Unreachable on :8000" : "Checking…"} />
            <Row label="Database" state={db} detail={db === "ok" ? "Connected" : db === "error" ? "Not connected" : "Checking…"} />
            <Row
              label="Catalogue"
              state={catalogue.loading ? "checking" : catalogue.items.length ? "ok" : "error"}
              detail={catalogue.loading ? "Checking…" : `${catalogue.items.length} products, ${catalogue.items.filter((p) => p.thumbnail_url).length} with photos`}
            />
            <Row
              label="Exact garment references"
              state={refs === null ? "checking" : exactCount > 0 ? (exactCount === colourCount ? "ok" : "warn") : "error"}
              detail={refs === null ? "Checking…" : `${exactCount} of ${colourCount} colours`}
            />
            <Row label="Camera API" state={camera ? "ok" : "warn"} detail={camera ? "Available (permission asked on use)" : "Not available in this browser"} />
            <Row label="WebSockets" state={"WebSocket" in window ? "ok" : "error"} detail={"WebSocket" in window ? "Supported" : "Unsupported"} />
            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="font-medium">Pose model (MediaPipe)</span>
              {pose === "idle" ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void testPose()}>
                  Test load
                </button>
              ) : (
                <span className="text-sm text-stone">{pose === "checking" ? "Loading…" : pose === "ok" ? "Loaded" : "Couldn't load (offline or blocked CDN)"}</span>
              )}
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-2xl">AI generation (CatVTON)</h2>
          <p className="mt-2 text-sm leading-6 text-stone">{ai.status?.message ?? "Checking…"}</p>
          <div className="mt-4">
            <AiStatusChecklist status={ai.status} error={ai.error} onRecheck={ai.recheck} />
          </div>
          <p className="mt-4 text-xs leading-5 text-stone">
            Requires an NVIDIA GPU with roughly 8 GB of VRAM, Docker with the NVIDIA Container Toolkit, and the CatVTON source
            checkout. Licence: CC BY-NC-SA 4.0 (non-commercial). Photos are only ever sent to this local worker — never to a hosted
            service.
          </p>
        </section>
      </div>

      <section className="mt-14">
        <h2 className="section-title">Suggested walkthrough</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_STEPS.map((step, index) => (
            <li key={step.to}>
              <Link to={step.to} className="card group flex h-full flex-col p-5 transition-shadow hover:shadow-lift">
                <span className="font-display text-sm italic text-wine">Step {index + 1}</span>
                <span className="mt-2 font-display text-xl">{step.title}</span>
                <span className="mt-2 flex-1 text-sm leading-6 text-stone">{step.body}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">
                  Open <Icon name="arrowRight" size={15} className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14">
        <h2 className="section-title">What's real, what's demo</h2>
        <div className="card mt-6 overflow-hidden">
          <table className="w-full text-left text-sm">
            <tbody>
              {REALITY.map(([feature, status]) => (
                <tr key={feature} className="border-b border-line last:border-b-0">
                  <th scope="row" className="w-1/3 px-5 py-3.5 font-semibold">
                    {feature}
                  </th>
                  <td className="px-5 py-3.5 text-stone">{status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
