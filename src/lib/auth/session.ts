import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { hasPermission, type Permission, type Role } from "./permissions";
import { AppError } from "@/lib/errors";

export const SESSION_COOKIE = "atelier_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // sliding 14 days

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  locale: string;
  /** The single account allowed to manage users. */
  isSuperAdmin: boolean;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db()`select atelier.auth_create_session(${userId}, ${hashToken(token)}, ${SESSION_TTL_SECONDS})`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function currentTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export async function destroySession(): Promise<void> {
  const hash = await currentTokenHash();
  if (hash) await db()`select atelier.auth_delete_session(${hash})`;
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const hash = await currentTokenHash();
  if (!hash) return null;
  const rows = await db()<
    { id: string; email: string; display_name: string; role: Role; locale: string; is_super_admin: boolean }[]
  >`select * from atelier.auth_resolve_session(${hash}, ${SESSION_TTL_SECONDS})`;
  const u = rows[0];
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    locale: u.locale,
    isSuperAdmin: u.is_super_admin === true,
  };
});

/** For pages: redirects to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirects home when the role lacks the permission. */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) redirect("/?denied=1");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function authorize(permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("unauthenticated");
  if (permission && !hasPermission(user, permission)) throw new AppError("forbidden");
  return user;
}
