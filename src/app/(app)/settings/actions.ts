"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action";
import { authorize, currentTokenHash } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { checkbox, reqText, uuid } from "@/lib/validation";
import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "@/lib/auth/password";
import { createCategory, createUser, updateCategory, updateSettings, updateUser } from "@/domain/settings/service";
import { createAccount, updateAccount } from "@/domain/ledger/service";
import { db } from "@/lib/db";

const password = () =>
  z
    .string()
    .min(PASSWORD_MIN_LENGTH, { error: "validation.passwordLength" })
    .max(200, { error: "validation.tooLong" });

export async function updateSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ workshopName: reqText(120), weekStartDay: z.coerce.number().int().min(0).max(6) }), async (v) => {
    const user = await authorize("settings.manage");
    await withUser(user.id, (tx) => updateSettings(tx, v));
    revalidatePath("/", "layout");
    return { message: "settings.saved" };
  });
}

export async function createCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ name: reqText(80) }), async (v) => {
    const user = await authorize("settings.manage");
    await withUser(user.id, (tx) => createCategory(tx, v.name));
    revalidatePath("/settings");
    return { message: "settings.saved" };
  });
}

export async function updateCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ id: uuid(), name: reqText(80), active: checkbox() }), async (v) => {
    const user = await authorize("settings.manage");
    await withUser(user.id, (tx) => updateCategory(tx, v));
    revalidatePath("/settings");
    return { message: "settings.saved" };
  });
}

export async function createAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ name: reqText(80), kind: z.enum(["cash", "bank", "other"]) }), async (v) => {
    const user = await authorize("accounts.manage");
    await withUser(user.id, (tx) => createAccount(tx, v));
    revalidatePath("/settings");
    revalidatePath("/cash");
    return { message: "settings.saved" };
  });
}

export async function updateAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ id: uuid(), name: reqText(80), active: checkbox(), isDefault: checkbox() }), async (v) => {
    const user = await authorize("accounts.manage");
    await withUser(user.id, (tx) => updateAccount(tx, v));
    revalidatePath("/settings");
    revalidatePath("/cash");
    return { message: "settings.saved" };
  });
}

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    fd,
    z.object({
      email: z.email({ error: "validation.email" }).max(254),
      displayName: reqText(120),
      role: z.enum(["owner", "manager"]),
      password: password(),
    }),
    async (v) => {
      const user = await authorize("users.manage");
      const passwordHash = await hashPassword(v.password);
      await withUser(user.id, (tx) => createUser(tx, { ...v, passwordHash })).catch((e) => {
        if ((e as { code?: string }).code === "23505") throw new AppError("duplicate", "email");
        throw e;
      });
      revalidatePath("/settings");
      return { message: "settings.userCreated" };
    },
  );
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ id: uuid(), displayName: reqText(120), role: z.enum(["owner", "manager"]), active: checkbox() }), async (v) => {
    const user = await authorize("users.manage");
    if (v.id === user.id && (!v.active || v.role !== "owner")) throw new AppError("invalid", "self_lockout");
    await withUser(user.id, (tx) => updateUser(tx, v));
    revalidatePath("/settings");
    return { message: "settings.saved" };
  });
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ id: uuid(), password: password() }), async (v) => {
    const user = await authorize("users.manage");
    const hash = await hashPassword(v.password);
    await withUser(user.id, (tx) => tx`select atelier.auth_set_password(${v.id}, ${hash}, ${null})`);
    return { message: "settings.passwordReset" };
  });
}

export async function changeOwnPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(
    fd,
    z
      .object({ current: z.string().min(1, { error: "validation.required" }), password: password(), confirm: z.string() })
      .refine((v) => v.password === v.confirm, { path: ["confirm"], error: "validation.passwordMismatch" }),
    async (v) => {
      const user = await authorize();
      const sql = db();
      const [throttled] = await sql<{ t: boolean }[]>`select atelier.auth_is_throttled(${user.email}, 'password-change') as t`;
      if (throttled?.t) return { ok: false, error: "auth.throttled" };
      const [row] = await sql<{ password_hash: string }[]>`select password_hash from atelier.auth_find_user(${user.email})`;
      const valid = Boolean(row && (await verifyPassword(v.current, row.password_hash)));
      await sql`select atelier.auth_record_attempt(${user.email}, 'password-change', ${valid})`;
      if (!valid) return { ok: false, error: "errors.invalid", fieldErrors: { current: "auth.wrongPassword" } };
      const hash = await hashPassword(v.password);
      const keep = await currentTokenHash();
      await withUser(user.id, (tx) => tx`select atelier.auth_set_password(${user.id}, ${hash}, ${keep})`);
      return { message: "settings.passwordChanged" };
    },
  );
}
