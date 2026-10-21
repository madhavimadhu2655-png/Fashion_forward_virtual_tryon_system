export interface User {
  id: string;
  full_name: string;
  email: string;
  role: "customer" | "admin";
  is_active: boolean;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}
