import "server-only";
import type { Tx } from "./db";
import { AppError } from "./errors";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/** Detects the real file type from its first bytes (the browser-provided type is not trusted). */
export function sniffMime(bytes: Uint8Array): (typeof ALLOWED_MIME_TYPES)[number] | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50)
    return "image/webp";
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "application/pdf";
  return null;
}

/** Reads an optional uploaded file from a form and validates its size and real type. */
export async function readUpload(fd: FormData, field = "attachment"): Promise<{ name: string; mime: string; data: Buffer } | null> {
  const f = fd.get(field);
  if (!f || typeof f === "string" || f.size === 0) return null;
  if (f.size > MAX_ATTACHMENT_BYTES) throw new AppError("invalid", "file_too_large");
  const data = Buffer.from(await f.arrayBuffer());
  const mime = sniffMime(data);
  if (!mime) throw new AppError("invalid", "file_type");
  const name = (f.name || "document").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120);
  return { name, mime, data };
}

export async function saveAttachment(
  tx: Tx,
  file: { name: string; mime: string; data: Buffer },
  target: { orderId?: string; ledgerEntryId?: string },
): Promise<string> {
  const [r] = await tx<{ id: string }[]>`
    insert into atelier.attachments (order_id, ledger_entry_id, filename, mime_type, size_bytes, data)
    values (${target.orderId ?? null}, ${target.ledgerEntryId ?? null}, ${file.name}, ${file.mime}, ${file.data.length}, ${file.data})
    returning id`;
  return r!.id;
}
