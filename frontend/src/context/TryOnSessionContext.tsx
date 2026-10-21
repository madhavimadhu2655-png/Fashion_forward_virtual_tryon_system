import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import type { QualityReport } from "../lib/photoQuality";
import { validatePhoto } from "../lib/photoValidation";
import type { EngineId } from "../lib/tryOnEngine";

/**
 * The uploaded photo and generated try-on images for this tab.
 *
 * PRIVACY: everything here lives in memory only — no localStorage,
 * IndexedDB, Cache API or server upload happens from this context. Object
 * URLs are revoked when a photo/result is replaced, removed, cleared, on
 * logout and when the app unmounts. Downloading is the only way an image
 * leaves the page, and that copy is the user's.
 */
export interface TryOnResult {
  id: string;
  engine: EngineId;
  productId: string;
  productName: string;
  colorName: string;
  colorHex: string;
  price: number;
  url: string;
  blob: Blob;
  tinted: boolean;
  warning: string | null;
  createdAt: number;
}

interface SessionValue {
  photo: File | null;
  photoUrl: string | null;
  photoError: string | null;
  quality: QualityReport | null;
  qualityChecking: boolean;
  consent: boolean;
  setConsent: (value: boolean) => void;
  choosePhoto: (file: File | undefined) => Promise<void>;
  clearPhoto: () => void;
  results: TryOnResult[];
  addResult: (result: Omit<TryOnResult, "id" | "url" | "createdAt">) => TryOnResult;
  removeResult: (id: string) => void;
  clearResults: () => void;
}

const MAX_RESULTS = 8;
const SessionContext = createContext<SessionValue | undefined>(undefined);

export function TryOnSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [qualityChecking, setQualityChecking] = useState(false);
  const [consent, setConsent] = useState(false);
  const [results, setResults] = useState<TryOnResult[]>([]);
  const photoUrlRef = useRef<string | null>(null);
  const resultsRef = useRef<TryOnResult[]>([]);
  const qualityRequest = useRef<AbortController | null>(null);
  resultsRef.current = results;

  const clearResults = useCallback(() => {
    resultsRef.current.forEach((r) => URL.revokeObjectURL(r.url));
    resultsRef.current = [];
    setResults([]);
  }, []);

  const clearPhoto = useCallback(() => {
    qualityRequest.current?.abort();
    qualityRequest.current = null;
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    setPhoto(null);
    setPhotoUrl(null);
    setQuality(null);
    setQualityChecking(false);
    setPhotoError(null);
    setConsent(false);
    clearResults(); // results are derived from the photo; drop them with it
  }, [clearResults]);

  const choosePhoto = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      clearPhoto();
      const error = await validatePhoto(file);
      if (error) {
        setPhotoError(error);
        return;
      }
      const url = URL.createObjectURL(file);
      photoUrlRef.current = url;
      setPhoto(file);
      setPhotoUrl(url);
      const controller = new AbortController();
      qualityRequest.current = controller;
      setQualityChecking(true);
      try {
        // Loaded on demand so MediaPipe isn't in the initial bundle.
        const { checkPhotoQuality } = await import("../lib/photoQualityRunner");
        const report = await checkPhotoQuality(url, controller.signal);
        if (!controller.signal.aborted) setQuality(report);
      } catch (err) {
        if (!controller.signal.aborted) {
          setQuality(null);
          setPhotoError(err instanceof Error ? err.message : "The photo couldn't be checked.");
        }
      } finally {
        if (qualityRequest.current === controller) {
          qualityRequest.current = null;
          setQualityChecking(false);
        }
      }
    },
    [clearPhoto],
  );

  const addResult = useCallback<SessionValue["addResult"]>((input) => {
    const result: TryOnResult = {
      ...input,
      id: crypto.randomUUID(),
      url: URL.createObjectURL(input.blob),
      createdAt: Date.now(),
    };
    setResults((current) => {
      const next = [result, ...current];
      next.slice(MAX_RESULTS).forEach((old) => URL.revokeObjectURL(old.url));
      return next.slice(0, MAX_RESULTS);
    });
    return result;
  }, []);

  const removeResult = useCallback((id: string) => {
    setResults((current) => {
      const target = current.find((r) => r.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((r) => r.id !== id);
    });
  }, []);

  // A different (or no) signed-in user must never see the previous person's photo.
  const userId = user?.id ?? null;
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current !== userId) clearPhoto();
    lastUser.current = userId;
  }, [userId, clearPhoto]);

  useEffect(
    () => () => {
      qualityRequest.current?.abort();
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
      resultsRef.current.forEach((r) => URL.revokeObjectURL(r.url));
    },
    [],
  );

  return (
    <SessionContext.Provider
      value={{
        photo,
        photoUrl,
        photoError,
        quality,
        qualityChecking,
        consent,
        setConsent,
        choosePhoto,
        clearPhoto,
        results,
        addResult,
        removeResult,
        clearResults,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useTryOnSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useTryOnSession must be used within a TryOnSessionProvider");
  return ctx;
}
