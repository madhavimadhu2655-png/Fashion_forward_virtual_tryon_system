import type {
  ProductListResponse,
  ProductDetail,
  FilterOptions,
} from "../types/product";
import type { AuthResponse, User } from "../types/auth";
import type { MeasurementPayload, MeasurementRecord } from "../types/measurement";
import type { GarmentAssetInfo } from "../types/garment";
import type { RoomInvite, RoomSnapshot, RoomSummary, SavedLook } from "../types/looks";

// Backend origin — used both for /api calls and for resolving image
// paths returned by the API (e.g. "/static/products/CT001/web/front.jpg").
export const BACKEND_ORIGIN: string = import.meta.env.VITE_BACKEND_ORIGIN ?? "http://localhost:8000";
const API_BASE_URL = `${BACKEND_ORIGIN}/api`;

const ACCESS_TOKEN_KEY = "ff_access_token";
const REFRESH_TOKEN_KEY = "ff_refresh_token";

// Storing a JWT in localStorage (not the password itself) is standard
// practice for this kind of app — this is a real project running in a
// real browser, not a Claude artifact sandbox where localStorage isn't
// available.
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Seconds until the stored access token expires (negative = expired, null = none/unreadable). */
export function accessTokenSecondsLeft(token = getAccessToken()): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp - Date.now() / 1000 : null;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Exchanges the refresh token for new tokens once, even if many requests ask at the same time. */
export function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(false);
  refreshInFlight ??= fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) return false;
      const body = (await response.json()) as AuthResponse;
      storeTokens(body.access_token, body.refresh_token);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** A current access token, refreshed first if it is about to expire. */
export async function getFreshAccessToken(): Promise<string | null> {
  const left = accessTokenSecondsLeft();
  if (left !== null && left < 60) await refreshTokens();
  return getAccessToken();
}

/** fetch() with the bearer token; on 401 it refreshes once and retries. */
export async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = () =>
    fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders() } });
  const response = await send();
  if (response.status !== 401 || !getRefreshToken()) return response;
  return (await refreshTokens()) ? send() : response;
}

export interface HealthResponse {
  status: string;
  database: string;
}

/** Prefixes a backend-relative path (image url, etc.) with the backend origin. */
export function resolveAssetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${BACKEND_ORIGIN}${path}`;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new Error(detail);
  }
  return response.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return handleResponse<HealthResponse>(response);
}

export interface ProductQueryParams {
  search?: string;
  category?: string;
  colors?: string[];
  sizes?: string[];
  fabric?: string;
  fit?: string;
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  is_trending?: boolean;
  is_new?: boolean;
  sort?: string;
  skip?: number;
  limit?: number;
}

function buildQueryString(params: ProductQueryParams): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      search.set(key, value.join(","));
    } else {
      search.set(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchProducts(params: ProductQueryParams = {}): Promise<ProductListResponse> {
  const response = await fetch(`${API_BASE_URL}/products${buildQueryString(params)}`);
  return handleResponse<ProductListResponse>(response);
}

export async function fetchProduct(id: string): Promise<ProductDetail> {
  const response = await fetch(`${API_BASE_URL}/products/${id}`);
  return handleResponse<ProductDetail>(response);
}

export async function fetchCategories(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/categories`);
  return handleResponse<string[]>(response);
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  const response = await fetch(`${API_BASE_URL}/products/filters`);
  return handleResponse<FilterOptions>(response);
}

// ---------- Auth ----------

export interface RegisterPayload {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ProfileUpdatePayload {
  full_name?: string;
  email?: string;
}

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AuthResponse>(response);
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AuthResponse>(response);
}

export async function fetchCurrentUser(): Promise<User> {
  const response = await authorizedFetch(`${API_BASE_URL}/auth/me`);
  return handleResponse<User>(response);
}

export async function updateProfile(payload: ProfileUpdatePayload): Promise<User> {
  const response = await authorizedFetch(`${API_BASE_URL}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<User>(response);
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: authHeaders(),
    });
  } finally {
    // Stateless JWT — the real "logout" is discarding tokens client-side.
    clearTokens();
  }
}

// ---------- Body measurements ----------

export async function saveMeasurement(payload: MeasurementPayload): Promise<MeasurementRecord> {
  const response = await authorizedFetch(`${API_BASE_URL}/body/measurements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<MeasurementRecord>(response);
}

export async function fetchMyMeasurements(): Promise<MeasurementRecord[]> {
  const response = await authorizedFetch(`${API_BASE_URL}/body/measurements`);
  return handleResponse<MeasurementRecord[]>(response);
}

// ---------- Garment assets (Milestone 6) ----------

export async function fetchGarmentAssets(productId: string, color?: string): Promise<GarmentAssetInfo> {
  const qs = color ? `?color=${encodeURIComponent(color)}` : "";
  const response = await fetch(`${API_BASE_URL}/products/${productId}/garment-assets${qs}`);
  return handleResponse<GarmentAssetInfo>(response);
}

// ---------- AI Photo Try-On ----------

export interface PhotoTryOnColor {
  color_name: string;
  color_hex: string;
  image_available: boolean;
}

export interface PhotoTryOnProduct {
  id: string;
  name: string;
  category: string;
  thumbnail_url: string | null;
  colors: PhotoTryOnColor[];
}

export interface PhotoTryOnCatalog {
  items: PhotoTryOnProduct[];
}

export interface PhotoTryOnCheck {
  id: string;
  label: string;
  ok: boolean;
  help: string;
}

export interface PhotoTryOnStatus {
  available: boolean;
  configured?: boolean;
  message: string;
  checks?: PhotoTryOnCheck[];
}

export async function fetchPhotoTryOnCatalog(): Promise<PhotoTryOnCatalog> {
  const response = await fetch(`${API_BASE_URL}/photo-try-on/catalog`, { cache: "no-store" });
  return handleResponse<PhotoTryOnCatalog>(response);
}

export async function fetchPhotoTryOnStatus(): Promise<PhotoTryOnStatus> {
  const response = await fetch(`${API_BASE_URL}/photo-try-on/status`, { cache: "no-store" });
  return handleResponse<PhotoTryOnStatus>(response);
}

export async function generatePhotoTryOn(
  photo: File,
  productId: string,
  color: string,
  consent: boolean,
  signal: AbortSignal,
): Promise<Blob> {
  const form = new FormData();
  form.append("photo", photo);
  form.append("product_id", productId);
  form.append("color", color);
  form.append("consent", String(consent));

  const response = await authorizedFetch(`${API_BASE_URL}/photo-try-on/generate`, {
    method: "POST",
    body: form,
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = `Try-on generation failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // Keep the generic error for non-JSON responses.
    }
    throw new Error(detail);
  }
  if (response.headers.get("content-type")?.split(";", 1)[0] !== "image/png") {
    throw new Error("The local AI model returned an invalid preview.");
  }
  return response.blob();
}

// ---------- Favourites (wishlist) ----------

async function wishlistCall(path: string, init: RequestInit = {}): Promise<string[]> {
  const response = await authorizedFetch(`${API_BASE_URL}/wishlist${path}`, init);
  return (await handleResponse<{ product_ids: string[] }>(response)).product_ids;
}

export const fetchWishlist = () => wishlistCall("");
export const addWishlistItem = (productId: string) =>
  wishlistCall(`/${encodeURIComponent(productId)}`, { method: "PUT" });
export const removeWishlistItem = (productId: string) =>
  wishlistCall(`/${encodeURIComponent(productId)}`, { method: "DELETE" });
export const mergeWishlist = (productIds: string[]) =>
  wishlistCall("/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_ids: productIds }),
  });

// ---------- Saved looks (metadata only — never images) ----------

export async function fetchSavedLooks(): Promise<SavedLook[]> {
  return handleResponse<SavedLook[]>(await authorizedFetch(`${API_BASE_URL}/saved-looks`));
}

export async function createSavedLook(payload: {
  product_id: string;
  color_name: string;
  label?: string | null;
  source?: "browser_fit" | "catvton" | "live_camera" | null;
}): Promise<SavedLook> {
  const response = await authorizedFetch(`${API_BASE_URL}/saved-looks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<SavedLook>(response);
}

export async function renameSavedLook(id: string, label: string | null): Promise<SavedLook> {
  const response = await authorizedFetch(`${API_BASE_URL}/saved-looks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  return handleResponse<SavedLook>(response);
}

export async function deleteSavedLook(id: string): Promise<void> {
  const response = await authorizedFetch(`${API_BASE_URL}/saved-looks/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) await handleResponse(response);
}

// ---------- Shop Together (fitting rooms) ----------

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const roomPath = (roomId: string, suffix = "") => `${API_BASE_URL}/rooms/${encodeURIComponent(roomId)}${suffix}`;

export async function createRoom(name: string): Promise<RoomSummary & { invite: RoomInvite }> {
  return handleResponse(await authorizedFetch(`${API_BASE_URL}/rooms`, postJson({ name })));
}

export async function fetchMyRooms(): Promise<RoomSummary[]> {
  return handleResponse(await authorizedFetch(`${API_BASE_URL}/rooms`));
}

export async function joinRoom(code: string): Promise<RoomSummary> {
  return handleResponse(await authorizedFetch(`${API_BASE_URL}/rooms/join`, postJson({ code })));
}

export async function fetchRoom(roomId: string): Promise<RoomSnapshot> {
  return handleResponse(await authorizedFetch(roomPath(roomId)));
}

export async function fetchRoomInvite(roomId: string): Promise<RoomInvite> {
  return handleResponse(await authorizedFetch(roomPath(roomId, "/invite")));
}

export async function rotateRoomInvite(roomId: string): Promise<RoomInvite> {
  return handleResponse(await authorizedFetch(roomPath(roomId, "/invite/rotate"), { method: "POST" }));
}

export async function leaveRoom(roomId: string): Promise<{ left: boolean; room_closed: boolean }> {
  return handleResponse(await authorizedFetch(roomPath(roomId, "/leave"), { method: "POST" }));
}

export async function closeRoom(roomId: string): Promise<{ closed: boolean }> {
  return handleResponse(await authorizedFetch(roomPath(roomId, "/close"), { method: "POST" }));
}

export function roomSocketUrl(roomId: string): string {
  return `${BACKEND_ORIGIN.replace(/^http/, "ws")}/api/rooms/${encodeURIComponent(roomId)}/ws`;
}
