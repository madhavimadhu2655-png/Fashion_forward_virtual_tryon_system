import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getPostAuthRedirect } from "../lib/authRedirect";
import AuthLayout from "../components/AuthLayout";
import { Notice } from "../components/ui";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const redirectTo = getPostAuthRedirect(location.state);

  function clientSideError(): string | null {
    if (fullName.trim().length === 0) return "Full name is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clientError = clientSideError();
    if (clientError) {
      setError(clientError);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await register({ full_name: fullName, email, password, confirm_password: confirmPassword });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const fields: { id: string; label: string; type: string; value: string; set: (v: string) => void; auto: string; hint?: string }[] = [
    { id: "reg-name", label: "Full name", type: "text", value: fullName, set: setFullName, auto: "name" },
    { id: "reg-email", label: "Email", type: "email", value: email, set: setEmail, auto: "email" },
    { id: "reg-password", label: "Password", type: "password", value: password, set: setPassword, auto: "new-password", hint: "At least 8 characters." },
    { id: "reg-confirm", label: "Confirm password", type: "password", value: confirmPassword, set: setConfirmPassword, auto: "new-password" },
  ];

  return (
    <AuthLayout title="Create your account" lede="Save favourites and looks, use the try-on studio and shop together with friends.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {fields.map((f) => (
          <div key={f.id}>
            <label htmlFor={f.id} className="label">
              {f.label}
            </label>
            <input id={f.id} type={f.type} required autoComplete={f.auto} value={f.value} onChange={(e) => f.set(e.target.value)} className="field" />
            {f.hint && <p className="hint">{f.hint}</p>}
          </div>
        ))}
        {error && (
          <Notice tone="error" live>
            {error}
          </Notice>
        )}
        <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full">
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-8 text-sm text-stone">
        Already have an account?{" "}
        <Link to="/login" state={location.state} className="link">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
