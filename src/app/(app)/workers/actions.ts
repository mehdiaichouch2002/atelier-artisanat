"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { checkbox, uuid } from "@/lib/validation";
import { createWorker, setWorkerActive, updateWorker } from "@/domain/workers/service";
import { WorkerSchema, toWorkerInput } from "./schema";

export async function createWorkerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, WorkerSchema, async (v) => {
    const user = await authorize("workers.manage");
    const id = await withUser(user.id, (tx) => createWorker(tx, toWorkerInput(v), v.idempotencyKey)).catch((e) => {
      if ((e as { constraint_name?: string }).constraint_name === "workers_code_key") throw new AppError("duplicate", "worker_code");
      throw e;
    });
    revalidatePath("/workers");
    return { message: "workers.saved", data: { redirect: `/workers/${id}?saved=1` } };
  });
}

export async function updateWorkerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, WorkerSchema.and(z.object({ id: uuid() })), async (v) => {
    const user = await authorize("workers.manage");
    await withUser(user.id, (tx) => updateWorker(tx, v.id, toWorkerInput(v))).catch((e) => {
      if ((e as { constraint_name?: string }).constraint_name === "workers_code_key") throw new AppError("duplicate", "worker_code");
      throw e;
    });
    revalidatePath("/workers");
    revalidatePath(`/workers/${v.id}`);
    return { message: "workers.saved", data: { redirect: `/workers/${v.id}?saved=1` } };
  });
}

export async function setWorkerActiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, z.object({ id: uuid(), active: checkbox() }), async (v) => {
    const user = await authorize("workers.manage");
    await withUser(user.id, (tx) => setWorkerActive(tx, v.id, v.active));
    revalidatePath("/workers");
    revalidatePath(`/workers/${v.id}`);
    return { message: v.active ? "workers.reactivated" : "workers.deactivated" };
  });
}
