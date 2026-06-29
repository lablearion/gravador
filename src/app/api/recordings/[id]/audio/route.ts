import { getActor } from "@/lib/session";
import { getRecordingForActor } from "@/lib/recordings";
import { fetchDriveMedia } from "@/lib/drive";

// Streama o áudio de uma gravação a partir do Drive central (server-side, DEC-009/011).
// O arquivo no Drive é "privado" do app; o acesso do usuário é mediado AQUI pela política (RBAC):
// só serve o áudio de uma gravação que o ator pode ver (DEC-005/015). Repassa Range para permitir seek.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const actor = await getActor();
  if (actor.status === "unavailable") return new Response("indisponível", { status: 503 });
  if (actor.status !== "ok") return new Response("não autorizado", { status: 401 });

  const det = await getRecordingForActor(actor.data, id);
  if (det.status === "unavailable") return new Response("indisponível", { status: 503 });
  if (det.status === "not-found") return new Response("não encontrada", { status: 404 });
  if (det.status === "forbidden") return new Response("sem acesso", { status: 403 });
  if (!det.data.driveFileId) return new Response("sem áudio", { status: 404 });

  const range = req.headers.get("range");
  const drive = await fetchDriveMedia(det.data.driveFileId, range);
  if (!drive.ok && drive.status !== 206) return new Response("falha no Drive", { status: 502 });

  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag"]) {
    const v = drive.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, no-store");

  return new Response(drive.body, { status: drive.status, headers });
}
