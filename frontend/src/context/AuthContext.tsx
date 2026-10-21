import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "../types/auth";
import {
  getAccessToken,
  storeTokens,
  clearTokens,
  fetchCurrentUser,
  loginUser,
  registerUser,
  logoutUser,
  updateProfile as apiUpdateProfile,
  type LoginPayload,
  type RegisterPayload,
  type ProfileUpdatePayload,
} from "../services/api";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (payload: ProfileUpdatePayload) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, if a token is already stored (from a previous session),
  // verify it's still valid and load the user — this is what keeps
  // someone logged in across a page refresh.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(payload: LoginPayload) {
    const res = await loginUser(payload);
    storeTokens(res.access_token, res.refresh_token);
    setUser(res.user);
  }

  async function register(payload: RegisterPayload) {
    const res = await registerUser(payload);
    storeTokens(res.access_token, res.refresh_token);
    setUser(res.user);
  }

  async function logout() {
    await logoutUser();
    setUser(null);
  }

  async function updateProfile(payload: ProfileUpdatePayload) {
    const updated = await apiUpdateProfile(payload);
    setUser(updated);
  }

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: user !== null, loading, login, register, logout, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
