import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import ProductImage from "../components/ProductImage";
import GarmentPicker from "../components/studio/GarmentPicker";
import { Avatar, Modal, Notice, Spinner, formatINR } from "../components/ui";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useCatalogue } from "../hooks/useCatalogue";
import { useGarmentRefs } from "../hooks/useTryOnData";
import { useTryOnSession } from "../context/TryOnSessionContext";
import { useToast } from "../context/ToastContext";
import { closeRoom, fetchRoomInvite, leaveRoom, rotateRoomInvite } from "../services/api";
import { resultLabel } from "../lib/resultActions";
import type { RoomInvite, RoomMemberState } from "../types/looks";

const SHARE_MAX_BYTES = 2_900_000;

/** Encodes a generated result for sharing, re-compressing it if it's over the 3 MB room limit. */
async function toShareableDataUrl(blob: Blob): Promise<string> {
  let source: Blob = blob;
  if (blob.size > SHARE_MAX_BYTES) {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    source = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the preview."))), "image/jpeg", 0.88));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read the preview."));
    reader.readAsDataURL(source);
  });
}

function InviteModal({ roomId, open, onClose, initial }: { roomId: string; open: boolean; onClose: () => void; initial: RoomInvite | null }) {
  const [invite, setInvite] = useState<RoomInvite | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { notify } = useToast();

  useEffect(() => {
    if (!open || invite) return;
    fetchRoomInvite(roomId)
      .then(setInvite)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the invitation."));
  }, [open, invite, roomId]);

  const link = invite ? `${window.location.origin}${invite.join_path}` : "";

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Copy isn't available here — select the text and copy it manually.");
    }
  }

  async function rotate() {
    try {
      setInvite(await rotateRoomInvite(roomId));
      notify("New invitation created. Old links and codes no longer work.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't replace the invitation.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite friends">
      {error && <Notice tone="error" className="mb-4">{error}</Notice>}
      {!invite ? (
        <Spinner label="Loading invitation…" />
      ) : (
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="invite-link">
              Invitation link
            </label>
            <div className="flex gap-2">
              <input id="invite-link" className="field font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-primary shrink-0" onClick={() => copy(link, "link")}>
                <Icon name="copy" size={16} /> {copied === "link" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div>
            <p className="label">Or share the code</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-control bg-canvas px-4 py-3 text-center font-mono text-lg tracking-wider">{invite.code}</code>
              <button type="button" className="btn btn-ghost shrink-0" onClick={() => copy(invite.code, "code")}>
                {copied === "code" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <p className="text-xs leading-5 text-stone">
            Anyone with this link or code who signs in can join (up to 6 people) until the room closes on{" "}
            {new Date(invite.expires_at).toLocaleString()}. Share it only with people you trust.
          </p>
          <button type="button" className="btn btn-quiet btn-sm" onClick={rotate}>
            <Icon name="refresh" size={14} /> Replace invitation (old links stop working)
          </button>
        </div>
      )}
    </Modal>
  );
}

function MemberLook({
  member,
  isMe,
  preview,
  myVote,
  leading,
  hearting,
  onHeart,
  onVote,
}: {
  member: RoomMemberState;
  isMe: boolean;
  preview: { image: string; engine: string; color_name: string; recoloured?: boolean } | undefined;
  myVote: string | null;
  leading: boolean;
  hearting: boolean;
  onHeart: () => void;
  onVote: () => void;
}) {
  const sel = member.selection;
  const voted = myVote === member.user_id;
  return (
    <article className="card relative flex flex-col overflow-hidden" aria-label={`${member.full_name}'s look`}>
      <div className="relative aspect-[3/4] bg-canvas">
        {preview ? (
          <>
            <img src={preview.image} alt={`${member.full_name}'s shared try-on preview`} className="h-full w-full object-cover" />
            <span className="badge badge-wine absolute left-3 top-3">{preview.engine === "catvton" ? "Shared AI preview" : preview.recoloured ? "Shared fit preview · recoloured" : "Shared fit preview"}</span>
          </>
        ) : sel ? (
          <>
            <ProductImage src={sel.thumbnail_url} alt={`Catalogue photo of ${sel.product_name}`} className="h-full w-full" />
            <span className="badge badge-neutral absolute left-3 top-3">Catalogue photo</span>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-stone">
            <Icon name="sparkle" size={22} />
            <p className="mt-2">{isMe ? "Pick a top below" : "Still choosing…"}</p>
          </div>
        )}
        {leading && <span className="badge badge-sage absolute right-3 top-3">Leading</span>}
        {hearting && (
          <span className="pop pointer-events-none absolute inset-0 flex items-center justify-center text-wine" aria-hidden="true">
            <Icon name="heart" size={72} filled />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2.5">
          <span className="relative">
            <Avatar initials={member.initials} hue={member.avatar_hue} size={32} />
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-porcelain ${member.online ? "bg-sage" : "bg-stone-light"}`} aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {member.full_name}
            {isMe && " (you)"}
            {member.is_owner && <span className="ml-1.5 text-xs font-normal text-stone">host</span>}
          </p>
          <span className="sr-only">{member.online ? "online" : "offline"}</span>
        </div>
        {sel ? (
          <div className="mt-3 text-sm">
            <Link to={`/product/${sel.product_id}`} className="line-clamp-1 font-medium hover:underline">
              {sel.product_name}
            </Link>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone">
              <span className="h-3 w-3 rounded-full ring-1 ring-ink/15" style={{ backgroundColor: sel.color_hex ?? undefined }} />
              {sel.color_name} · {formatINR(sel.price)}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-stone">No pick yet</p>
        )}
        <div className="mt-auto flex gap-2 pt-4">
          <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={onHeart} aria-label={`Send a heart to ${member.full_name}`} disabled={isMe}>
            <Icon name="heart" size={15} filled={member.hearts > 0} className={member.hearts ? "text-wine" : ""} /> {member.hearts}
          </button>
          <button
            type="button"
            className={`btn btn-sm flex-1 ${voted ? "btn-primary" : "btn-ghost"}`}
            onClick={onVote}
            disabled={isMe || !sel}
            aria-pressed={voted}
            aria-label={voted ? `Remove your vote for ${member.full_name}` : `Vote for ${member.full_name}'s look`}
          >
            <Icon name="vote" size={15} /> {member.votes}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();
  const catalogue = useCatalogue();
  const refs = useGarmentRefs();
  const session = useTryOnSession();
  const room = useRoomSocket(roomId);
  const [inviteOpen, setInviteOpen] = useState(Boolean((location.state as { invite?: RoomInvite } | null)?.invite));
  const [chat, setChat] = useState("");
  const [sharing, setSharing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const initialInvite = (location.state as { invite?: RoomInvite } | null)?.invite ?? null;

  const snap = room.snapshot;
  const me = snap?.members.find((m) => m.user_id === snap.me) ?? null;
  const mySelection = me?.selection ?? null;
  const myPreview = snap ? room.previews[snap.me] : undefined;
  const shareable = session.results.filter((r) => mySelection && r.productId === mySelection.product_id && r.colorName === mySelection.color_name);
  const maxVotes = Math.max(0, ...(snap?.members.map((m) => m.votes) ?? [0]));
  const heartTargets = useMemo(() => new Set(room.hearts.map((h) => h.target)), [room.hearts]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [room.messages.length]);

  async function share(resultId: string) {
    const result = session.results.find((r) => r.id === resultId);
    if (!result || !mySelection) return;
    setSharing(true);
    try {
      const image = await toShareableDataUrl(result.blob);
      room.send({ type: "share_preview", engine: result.engine, recoloured: result.tinted, product_id: result.productId, color_name: result.colorName, image });
      notify("Preview shared with the room. Your original photo wasn't shared.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't share the preview.", { tone: "error" });
    } finally {
      setSharing(false);
    }
  }

  async function leave() {
    if (!roomId || !snap) return;
    try {
      if (snap.room.is_owner) await closeRoom(roomId);
      else await leaveRoom(roomId);
      navigate("/rooms", { replace: true });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't leave the room.", { tone: "error" });
    }
  }

  if (room.ended) {
    return (
      <div className="page max-w-xl py-20">
        <Notice
          tone={room.ended.code === 4401 ? "warning" : "info"}
          title={room.ended.code === 4410 ? "Room closed" : room.ended.code === 4401 ? "Signed out" : "You're not in this room"}
          action={
            room.ended.code === 4401 ? (
              <Link to="/login" state={{ from: `/rooms/${roomId}` }} className="btn btn-primary btn-sm">
                Sign in again
              </Link>
            ) : (
              <Link to="/rooms" className="btn btn-ghost btn-sm">
                Back to Shop Together
              </Link>
            )
          }
        >
          {room.ended.reason} Any shared previews have been discarded.
        </Notice>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="page py-20 text-center">
        <Spinner label={room.connection === "reconnecting" ? "Reconnecting to the fitting room…" : "Joining the fitting room…"} />
      </div>
    );
  }

  return (
    <div className="page pb-16 pt-10 lg:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
        <div className="min-w-0">
          <p className="eyebrow">Shop Together · private room</p>
          <h1 className="mt-3 truncate font-display text-4xl sm:text-5xl">{snap.room.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-stone">
            <span className="flex -space-x-2">
              {snap.members.map((m) => (
                <span key={m.user_id} title={`${m.full_name}${m.online ? " (online)" : ""}`}>
                  <Avatar initials={m.initials} hue={m.avatar_hue} size={30} ring />
                </span>
              ))}
            </span>
            <span>
              {snap.members.filter((m) => m.online).length} of {snap.members.length} online
            </span>
            <span aria-live="polite" className={`badge ${room.connection === "live" ? "badge-sage" : "badge-amber"}`}>
              {room.connection === "live" ? "Live" : "Reconnecting…"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {snap.room.is_owner && (
            <button type="button" className="btn btn-primary" onClick={() => setInviteOpen(true)}>
              <Icon name="link" size={16} /> Invite
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmLeave(true)}>
            <Icon name="logout" size={16} /> {snap.room.is_owner ? "Close room" : "Leave"}
          </button>
        </div>
      </header>

      {room.serverError && (
        <Notice tone="warning" className="mt-6" live>
          {room.serverError}
        </Notice>
      )}

      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          <section aria-label="Everyone's looks">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {snap.members.map((member) => (
                <MemberLook
                  key={member.user_id}
                  member={member}
                  isMe={member.user_id === snap.me}
                  preview={room.previews[member.user_id]}
                  myVote={snap.my_vote}
                  leading={maxVotes > 0 && member.votes === maxVotes}
                  hearting={heartTargets.has(member.user_id)}
                  onHeart={() => room.send({ type: "heart", target_user_id: member.user_id })}
                  onVote={() => room.send({ type: "vote", target_user_id: snap.my_vote === member.user_id ? null : member.user_id })}
                />
              ))}
            </div>
            {snap.members.length === 1 && snap.room.is_owner && (
              <Notice tone="info" className="mt-5" action={<button className="btn btn-ghost btn-sm" onClick={() => setInviteOpen(true)}>Invite friends</button>}>
                You're the only one here. Send the invitation link so friends can join from their own devices.
              </Notice>
            )}
          </section>

          <GarmentPicker
            heading="Your pick"
            products={catalogue.items}
            loading={catalogue.loading}
            productId={mySelection?.product_id ?? null}
            colorName={mySelection?.color_name ?? null}
            onChange={(productId, colorName) => room.send({ type: "select", product_id: productId, color_name: colorName })}
            isExact={refs.isExact}
          />

          <section className="card p-5 sm:p-6" aria-labelledby="share-heading">
            <h2 id="share-heading" className="font-display text-2xl">
              Share a preview
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone">
              Only a generated try-on image is shared — never your original photo. It's sent to people in this room only, held in
              memory, and discarded when you stop sharing, change your pick, leave, or the room closes.
            </p>
            {myPreview ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <img src={myPreview.image} alt="Your shared preview" className="h-24 w-20 rounded-control object-cover" />
                <button type="button" className="btn btn-ghost" onClick={() => room.send({ type: "unshare_preview" })}>
                  Stop sharing
                </button>
              </div>
            ) : !mySelection ? (
              <p className="mt-4 text-sm">Pick a top above first.</p>
            ) : shareable.length === 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-sm">No preview of {mySelection.product_name} in {mySelection.color_name} in this tab yet.</p>
                <Link to={`/studio?product=${mySelection.product_id}&color=${encodeURIComponent(mySelection.color_name)}`} className="btn btn-accent btn-sm">
                  <Icon name="sparkle" size={14} /> Generate one
                </Link>
              </div>
            ) : (
              <ul className="mt-4 flex flex-wrap gap-4">
                {shareable.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <img src={r.url} alt="" className="h-24 w-20 rounded-control object-cover" />
                    <span>
                      <span className="block text-xs text-stone">{resultLabel(r)}</span>
                      <button type="button" className="btn btn-primary btn-sm mt-1.5" onClick={() => void share(r.id)} disabled={sharing || room.connection !== "live"}>
                        <Icon name="users" size={14} /> {sharing ? "Sharing…" : "Share with room"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="card flex min-w-0 max-h-[80vh] flex-col xl:sticky xl:top-24" aria-label="Room chat">
          <h2 className="border-b border-line px-5 py-4 font-display text-xl">Chat</h2>
          <div ref={chatRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
            {room.messages.length === 0 && <p className="text-sm text-stone">No messages yet. Say hi!</p>}
            {room.messages.map((m) => {
              const mine = m.user_id === snap.me;
              return (
                <div key={m.id} className={`max-w-[85%] ${mine ? "ml-auto text-right" : ""}`}>
                  <p className="text-[11px] text-stone">
                    {mine ? "You" : m.user_name} · {new Date(m.created_at + (m.created_at.endsWith("Z") ? "" : "Z")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className={`mt-0.5 inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-sm ${mine ? "rounded-br-md bg-ink text-ivory" : "rounded-bl-md bg-canvas"}`}>{m.body}</p>
                </div>
              );
            })}
          </div>
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (chat.trim() && room.send({ type: "chat", body: chat.trim() })) setChat("");
            }}
          >
            <label htmlFor="room-chat" className="sr-only">
              Message
            </label>
            <input id="room-chat" className="field h-10 rounded-full" value={chat} onChange={(e) => setChat(e.target.value)} maxLength={500} placeholder="Message the room" />
            <button type="submit" className="btn btn-primary h-10 w-10 shrink-0 px-0" aria-label="Send message" disabled={!chat.trim() || room.connection !== "live"}>
              <Icon name="send" size={16} />
            </button>
          </form>
        </aside>
      </div>

      {roomId && snap.room.is_owner && <InviteModal roomId={roomId} open={inviteOpen} onClose={() => setInviteOpen(false)} initial={initialInvite} />}
      <Modal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={snap.room.is_owner ? "Close this room for everyone?" : "Leave this room?"}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmLeave(false)}>
              Stay
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void leave()}>
              {snap.room.is_owner ? "Close room" : "Leave"}
            </button>
          </>
        }
      >
        <p className="text-sm leading-6 text-stone">
          {snap.room.is_owner
            ? "Everyone will be disconnected, the invitation stops working and all shared previews are discarded."
            : "Your pick, votes and any preview you shared are removed. You'll need a new invitation to come back."}
        </p>
      </Modal>
    </div>
  );
}
