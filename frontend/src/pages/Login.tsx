import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getPostAuthRedirect } from "../lib/authRedirect";
import AuthLayout from "../components/AuthLayout";
import { Notice } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = getPostAuthRedirect(location.state);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" lede="Log in to use the try-on studio, save looks and join fitting rooms.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="label">
            Email
          </label>
          <input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
        </div>
        <div>
          <label htmlFor="login-password" className="label">
            Password
          </label>
          <input id="login-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" />
        </div>
        {error && (
          <Notice tone="error" live>
            {error}
          </Notice>
        )}
        <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full">
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-3 text-xs text-stone">Password reset isn't available yet.</p>
      <p className="mt-8 text-sm text-stone">
        New here?{" "}
        <Link to="/register" state={location.state} className="link">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
