import { ApiError } from "./errorHandler";

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export type AuthContext = {
  user: AuthenticatedUser | null;
};

export async function authenticateRequest(_request: Request): Promise<AuthContext> {
  // Future identity providers must verify a signed token here. Do not trust
  // userId values supplied by request JSON, query parameters, or arbitrary headers.
  return { user: null };
}

export function requireAuthenticatedUser(auth: AuthContext): AuthenticatedUser {
  if (!auth.user) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Authenticated OMNIwx accounts are not configured yet.");
  }
  return auth.user;
}

