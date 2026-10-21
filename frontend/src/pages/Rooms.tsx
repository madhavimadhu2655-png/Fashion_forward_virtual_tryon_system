import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Notice, SectionHeader } from "../components/ui";
import { createRoom, fetchMyRooms } from "../services/api";
import type { RoomSummary } from "../types/looks";

const HOW = [
  { icon: "lock" as const, title: "Private by invitation", body: "Only people with your link or code — and signed in — can join. Up to 6 people; rooms expire after 24 hours." },
  { icon: "users" as const, title: "Everyone picks their own", body: "Each person chooses a top and colour; picks sync to everyone instantly." },
  { icon: "image" as const, title: "Share previews only if you choose", body: "Generated previews are shared only when you press Share — never your original photo — and are never stored." },
];

export default function Rooms() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyRooms()
      .then(setRooms)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load your rooms."));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const room = await createRoom(name.trim() || "Fitting room");
      navigate(`/rooms/${room.id}`, { state: { invite: room.invite } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the room.");
      setBusy(null);
    }
  }

  function join(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim()) navigate(`/rooms/join#code=${encodeURIComponent(code.trim())}`);
  }

  return (
    <div className="page pb-16 pt-10 lg:pt-14">
      <SectionHeader
        as="h1"
        eyebrow="Shop Together"
        title="A fitting room for you and your friends"
        lede="Open a private room, invite people on their own devices, and decide together — with live picks, chat, hearts and a vote."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <form onSubmit={create} className="card p-6 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-ivory">
            <Icon name="plus" size={20} />
          </span>
          <h2 className="mt-5 font-display text-2xl">Open a fitting room</h2>
          <label htmlFor="room-name" className="label mt-5">
            Room name
          </label>
          <input id="room-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goa trip outfits" maxLength={60} />
          <button type="submit" className="btn btn-primary btn-lg mt-5 w-full" disabled={busy !== null}>
            {busy === "create" ? "Opening…" : "Open room & get invite link"}
          </button>
        </form>

        <form onSubmit={join} className="card p-6 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-wine-soft text-wine">
            <Icon name="link" size={20} />
          </span>
          <h2 className="mt-5 font-display text-2xl">Join with a code</h2>
          <label htmlFor="room-code" className="label mt-5">
            Invitation code
          </label>
          <input
            id="room-code"
            className="field font-mono uppercase tracking-wider"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABC123-XXXXXXXXXX"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="hint">Or just open the invite link your friend sent.</p>
          <button type="submit" className="btn btn-ghost btn-lg mt-5 w-full" disabled={!code.trim()}>
            Join room
          </button>
        </form>
      </div>

      {error && (
        <Notice tone="error" className="mt-6" live>
          {error}
        </Notice>
      )}

      <section className="mt-12">
        <h2 className="font-display text-2xl">Your open rooms</h2>
        {loadError ? (
          <Notice tone="error" className="mt-4">
            {loadError}
          </Notice>
        ) : rooms === null ? (
          <div className="skeleton mt-4 h-20 rounded-card" />
        ) : rooms.length === 0 ? (
          <p className="mt-3 text-sm text-stone">None right now. Rooms you open or join appear here until they close or expire.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link to={`/rooms/${room.id}`} className="card flex items-center justify-between gap-4 p-5 transition-shadow hover:shadow-lift">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{room.name}</span>
                    <span className="text-xs text-stone">
                      {room.is_owner ? "You're the host" : "Guest"} · closes {new Date(room.expires_at).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <Icon name="arrowRight" size={18} className="shrink-0 text-stone" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ul className="mt-14 grid gap-5 border-t border-line pt-10 md:grid-cols-3">
        {HOW.map((item) => (
          <li key={item.title} className="flex gap-4">
            <Icon name={item.icon} size={22} className="mt-1 shrink-0 text-wine" />
            <span>
              <span className="block font-semibold">{item.title}</span>
              <span className="mt-1 block text-sm leading-6 text-stone">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
