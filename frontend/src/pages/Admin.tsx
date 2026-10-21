import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BACKEND_ORIGIN, authorizedFetch } from "../services/api";
import { Notice, SectionHeader } from "../components/ui";

export default function Admin() {
  const { user } = useAuth();
  const [ping, setPing] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    authorizedFetch(`${BACKEND_ORIGIN}/api/admin/ping`)
      .then(async (res) => {
        const data = await res.json();
        setPing({ ok: res.ok, message: data.message ?? data.detail ?? JSON.stringify(data) });
      })
      .catch(() => setPing({ ok: false, message: "Couldn't reach the admin API." }));
  }, []);

  return (
    <div className="page max-w-3xl pb-16 pt-10 lg:pt-14">
      <SectionHeader
        as="h1"
        eyebrow="Administration"
        title="Admin"
        lede={`Signed in as ${user?.full_name} (${user?.role}). Product management isn't built yet; this page proves admin authorisation is enforced by the backend.`}
      />
      {ping && (
        <Notice tone={ping.ok ? "success" : "error"} className="mt-8" title={ping.ok ? "Backend confirmed admin access" : "Admin check failed"}>
          {ping.message}
        </Notice>
      )}
      <p className="mt-6 text-sm text-stone">
        Service health and the AI worker status are on the{" "}
        <Link to="/status" className="link">
          system status page
        </Link>
        .
      </p>
    </div>
  );
}
