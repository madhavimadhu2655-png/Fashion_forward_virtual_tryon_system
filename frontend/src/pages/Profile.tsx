import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";
import { fetchMyMeasurements } from "../services/api";
import type { MeasurementRecord } from "../types/measurement";
import Icon, { type IconName } from "../components/Icon";
import { Notice } from "../components/ui";

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const { productIds } = useWishlist();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [measurement, setMeasurement] = useState<MeasurementRecord | null | undefined>(undefined);

  useEffect(() => {
    fetchMyMeasurements()
      .then((records) => setMeasurement(records[0] ?? null))
      .catch(() => setMeasurement(null));
  }, []);

  if (!user) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: { full_name?: string; email?: string } = {};
      if (fullName !== user!.full_name) payload.full_name = fullName;
      if (email !== user!.email) payload.email = email;
      await updateProfile(payload);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update profile.");
    } finally {
      setSaving(false);
    }
  }

  const shortcuts: { to: string; icon: IconName; title: string; body: string }[] = [
    { to: "/saved-looks", icon: "bookmark", title: "Saved looks", body: "Product and colour picks to revisit." },
    { to: "/wishlist", icon: "heart", title: `Favourites (${productIds.size})`, body: "Tops you've hearted." },
    { to: "/rooms", icon: "users", title: "Fitting rooms", body: "Rooms you host or have joined." },
    { to: "/orders", icon: "bag", title: "Orders", body: "Not available — checkout is a demo." },
  ];

  return (
    <div className="page max-w-4xl pb-16 pt-10 lg:pt-14">
      <div className="flex flex-wrap items-center gap-5 border-b border-line pb-8">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-wine-soft font-display text-4xl text-wine" aria-hidden="true">
          {user.full_name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="eyebrow">Your account</p>
          <h1 className="mt-2 truncate font-display text-4xl">{user.full_name}</h1>
          <p className="mt-1 truncate text-sm text-stone">
            {user.email} · member since {new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <section className="card mt-8 p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl">Details</h2>
          {!editing && (
            <button onClick={() => setEditing(true)} className="btn btn-ghost btn-sm">
              <Icon name="edit" size={14} /> Edit
            </button>
          )}
        </div>
        {editing ? (
          <form onSubmit={handleSave} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="profile-name" className="label">
                Full name
              </label>
              <input id="profile-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="field" autoComplete="name" />
            </div>
            <div>
              <label htmlFor="profile-email" className="label">
                Email
              </label>
              <input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" autoComplete="email" />
            </div>
            {error && (
              <Notice tone="error" className="sm:col-span-2" live>
                {error}
              </Notice>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setFullName(user.full_name);
                  setEmail(user.email);
                  setError(null);
                }}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-stone">Name</dt>
              <dd className="mt-0.5 font-medium">{user.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone">Email</dt>
              <dd className="mt-0.5 font-medium">{user.email}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="card mt-6 p-6">
        <h2 className="font-display text-2xl">Body proportions</h2>
        {measurement === undefined ? (
          <div className="skeleton mt-4 h-10 rounded" />
        ) : measurement ? (
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            Last captured {new Date(measurement.created_at).toLocaleString()} with the live camera — shoulders {measurement.shoulder_width ?? "–"}, torso{" "}
            {measurement.torso_length ?? "–"}, hips {measurement.hip_width ?? "–"} ({measurement.measurement_unit} frame units).
          </p>
        ) : (
          <p className="mt-3 text-sm text-stone">Nothing captured yet.</p>
        )}
        <p className="mt-2 text-xs leading-5 text-stone">
          These are uncalibrated 2D ratios from pose detection, not centimetres, and can't be used to pick a size.{" "}
          <Link to="/try-on" className="link">
            Capture in live camera
          </Link>
        </p>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {shortcuts.map((s) => (
          <Link key={s.to} to={s.to} className="card flex items-center gap-4 p-5 transition-shadow hover:shadow-lift">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canvas text-wine">
              <Icon name={s.icon} size={20} />
            </span>
            <span>
              <span className="block font-semibold">{s.title}</span>
              <span className="text-xs text-stone">{s.body}</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-stone">Password change and account deletion aren't implemented yet.</p>
      <button onClick={() => logout()} className="btn btn-danger mt-6">
        <Icon name="logout" size={16} /> Log out
      </button>
    </div>
  );
}
