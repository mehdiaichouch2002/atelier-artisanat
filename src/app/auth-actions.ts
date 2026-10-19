"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth/session";
import { getDummyHash, verifyPassword } from "@/lib/auth/password";
import type { ActionState } from "@/lib/action";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = LoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")).slice(0, 254) : "";
  if (!parsed.success) return { error: "auth.invalidCredentials", values: { email } };
  const ip = await clientIp();
  const sql = db();
  const [throttled] = await sql<{ t: boolean }[]>`select atelier.auth_is_throttled(${parsed.data.email}, ${ip}) as t`;
  if (throttled?.t) return { error: "auth.throttled", values: { email } };
  const [user] = await sql<{ id: string; password_hash: string; active: boolean }[]>`
    select * from atelier.auth_find_user(${parsed.data.email})`;
  // Always run a hash comparison so response time does not reveal whether the e-mail exists.
  const ok = await verifyPassword(parsed.data.password, user?.password_hash ?? (await getDummyHash()));
  const success = Boolean(user && user.active && ok);
  await sql`select atelier.auth_record_attempt(${parsed.data.email}, ${ip}, ${success})`;
  if (!success) return { error: "auth.invalidCredentials", values: { email } };
  await createSession(user!.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
