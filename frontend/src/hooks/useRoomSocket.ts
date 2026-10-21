import { useCallback, useEffect, useRef, useState } from "react";
import { getFreshAccessToken, refreshTokens, roomSocketUrl } from "../services/api";
import type { RoomChatMessage, RoomSnapshot, SharedPreview } from "../types/looks";

export type RoomConnection = "connecting" | "live" | "reconnecting" | "ended";

export interface RoomEnd {
  code: number;
  reason: string;
}

/** Close codes the server uses for states a reconnect can't fix. */
const FINAL_CODES: Record<number, string> = {
  4403: "You left this fitting room.",
  4404: "This fitting room doesn't exist or you're no longer a member.",
  4410: "This fitting room has been closed.",
};

export function backoffDelay(attempt: number): number {
  return Math.min(15_000, 1000 * 2 ** attempt);
}

export function useRoomSocket(roomId: string | undefined) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [previews, setPreviews] = useState<Record<string, SharedPreview>>({});
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [connection, setConnection] = useState<RoomConnection>("connecting");
  const [ended, setEnded] = useState<RoomEnd | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [hearts, setHearts] = useState<{ id: number; target: string }[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const heartId = useRef(0);

  useEffect(() => {
    if (!roomId) return;
    let stopped = false;
    let attempt = 0;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;
    let triedRefresh = false;

    async function connect() {
      if (stopped) return;
      setConnection(attempt === 0 ? "connecting" : "reconnecting");
      const token = await getFreshAccessToken();
      if (stopped) return;
      if (!token) {
        setEnded({ code: 4401, reason: "Your session has expired. Sign in again." });
        setConnection("ended");
        return;
      }
      const ws = new WebSocket(roomSocketUrl(roomId!));
      socketRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token }));
        pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 25_000);
      };
      ws.onmessage = (event) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        switch (data.type) {
          case "state": {
            const state = data as unknown as RoomSnapshot & { previews?: SharedPreview[] };
            attempt = 0;
            triedRefresh = false;
            setConnection("live");
            setSnapshot({ room: state.room, me: state.me, members: state.members, my_vote: state.my_vote, messages: state.messages });
            if (state.messages) setMessages(state.messages);
            if (state.previews) setPreviews(Object.fromEntries(state.previews.map((p) => [p.user_id, p])));
            break;
          }
          case "chat":
            setMessages((current) => [...current.slice(-99), data.message as RoomChatMessage]);
            break;
          case "preview": {
            const preview = data.preview as SharedPreview;
            setPreviews((current) => ({ ...current, [preview.user_id]: preview }));
            break;
          }
          case "preview_removed":
            setPreviews((current) => {
              const next = { ...current };
              delete next[data.user_id as string];
              return next;
            });
            break;
          case "heart": {
            const id = heartId.current++;
            setHearts((current) => [...current.slice(-11), { id, target: data.target_user_id as string }]);
            window.setTimeout(() => setHearts((current) => current.filter((h) => h.id !== id)), 1600);
            break;
          }
          case "error":
            setServerError(String(data.detail ?? "Something went wrong."));
            window.setTimeout(() => setServerError(null), 5000);
            break;
        }
      };
      ws.onclose = async (event) => {
        window.clearInterval(pingTimer);
        if (socketRef.current === ws) socketRef.current = null;
        if (stopped) return;
        if (FINAL_CODES[event.code]) {
          setEnded({ code: event.code, reason: FINAL_CODES[event.code] });
          setConnection("ended");
          setPreviews({});
          return;
        }
        if (event.code === 4401) {
          if (!triedRefresh && (await refreshTokens())) {
            triedRefresh = true;
            void connect();
            return;
          }
          setEnded({ code: 4401, reason: "Your session has expired. Sign in again to rejoin." });
          setConnection("ended");
          return;
        }
        setConnection("reconnecting");
        retryTimer = window.setTimeout(() => void connect(), backoffDelay(attempt++));
      };
    }

    void connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      socketRef.current?.close(1000, "Left page");
      socketRef.current = null;
      setPreviews({}); // shared images are dropped from memory when leaving the room
    };
  }, [roomId]);

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setServerError("Not connected yet — please wait a moment.");
      return false;
    }
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  return { snapshot, previews, messages, connection, ended, serverError, hearts, send };
}
