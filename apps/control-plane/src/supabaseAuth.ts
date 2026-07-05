import type { Request } from "express";
import { isSupabaseConfigured, supabaseAdmin } from "./supabaseAdmin.js";

export interface VerifiedSupabaseUser {
  id: string;
  email: string;
}

export function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export async function verifySupabaseAccessToken(
  req: Request,
): Promise<VerifiedSupabaseUser | null> {
  const token = readBearerToken(req);
  if (!token || !isSupabaseConfigured()) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user?.id) return null;
  return {
    id: data.user.id,
    email: (data.user.email ?? "").trim().toLowerCase(),
  };
}
