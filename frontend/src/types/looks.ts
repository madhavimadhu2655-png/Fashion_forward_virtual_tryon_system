/** A saved look is metadata only — the API never stores or returns images. */
export interface SavedLook {
  id: string;
  product_id: string;
  color_name: string;
  label: string | null;
  source: "browser_fit" | "catvton" | "live_camera" | null;
  created_at: string;
  updated_at: string;
  product_name: string | null;
  product_price: number | null;
  product_thumbnail_url: string | null;
  color_hex: string | null;
}

export interface RoomSummary {
  id: string;
  name: string;
  owner_id: string;
  is_owner: boolean;
  created_at: string;
  expires_at: string;
  closed: boolean;
  max_members: number;
}

export interface RoomInvite {
  code: string;
  join_path: string;
  expires_at: string;
}

export interface RoomSelection {
  product_id: string;
  product_name: string;
  color_name: string;
  color_hex: string | null;
  price: number;
  thumbnail_url: string | null;
  updated_at: string | null;
}

export interface RoomMemberState {
  user_id: string;
  full_name: string;
  initials: string;
  avatar_hue: number;
  is_owner: boolean;
  online: boolean;
  joined_at: string;
  selection: RoomSelection | null;
  hearts: number;
  votes: number;
}

export interface RoomChatMessage {
  id: string;
  kind: "chat" | "heart";
  user_id: string;
  user_name: string;
  body: string | null;
  target_user_id: string | null;
  created_at: string;
}

export interface SharedPreview {
  user_id: string;
  product_id: string;
  color_name: string;
  engine: "browser_fit" | "catvton";
  /** The browser fit recoloured a different-colour cutout (approximation). */
  recoloured?: boolean;
  shared_at: number;
  /** data: URL delivered over the authenticated socket; held in memory only. */
  image: string;
}

export interface RoomSnapshot {
  room: RoomSummary;
  me: string;
  members: RoomMemberState[];
  my_vote: string | null;
  messages: RoomChatMessage[];
}
