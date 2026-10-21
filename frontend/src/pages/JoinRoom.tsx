import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Notice, Spinner } from "../components/ui";
import { joinRoom } from "../services/api";

/**
 * Handles invite links of the form /rooms/join#code=XXXX. The code is in
 * the URL fragment so it is never sent to any server in a request line or
 * Referer header; it is removed from the address bar as soon as it is read.
 */
export default function JoinRoom() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(location.hash.replace(/^#/, "")).get("code");
    window.history.replaceState(null, "", "/rooms/join");
    if (!code) {
      setError("This invitation link is missing its code.");
      return;
    }
    joinRoom(code)
      .then((room) => navigate(`/rooms/${room.id}`, { replace: true }))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't join this room."));
  }, [location.hash, navigate]);

  return (
    <div className="page max-w-xl py-20">
      {error ? (
        <Notice tone="error" title="Couldn't join the fitting room" action={<Link to="/rooms" className="btn btn-ghost btn-sm">Back to Shop Together</Link>}>
          {error}
        </Notice>
      ) : (
        <div className="card p-8 text-center">
          <Spinner label="Checking your invitation…" />
        </div>
      )}
    </div>
  );
}
