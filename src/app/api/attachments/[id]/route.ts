import { getSessionUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { isUuid } from "@/lib/page";

// Serves a private attachment to signed-in members only (RLS filters the row otherwise).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const row = await withUser(user.id, async (tx) => {
    const [r] = await tx<{ filename: string; mime_type: string; data: Buffer }[]>`
      select filename, mime_type, data from atelier.attachments where id = ${id}`;
    return r;
  });
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
