import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchDriveMedia } from "@/lib/drive";

// Streama o avatar de um perfil a partir do Drive central (server-side; o arquivo é "privado" do app
// sob o escopo drive.file). Baixa sensibilidade — basta sessão autenticada (membros do mesmo espaço).
// `[id]` = profileId. Sem avatar → 404 (a UI usa o fallback de inicial). (REQ-032 / DEV-019)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const session = await auth();
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return new Response("não autorizado", { status: 401 });
  }

  const pr = await supabaseAdmin
    .from("profiles")
    .select("avatar_drive_id")
    .eq("id", id)
    .maybeSingle();
  if (pr.error) return new Response("indisponível", { status: 503 });
  const driveId = (pr.data as { avatar_drive_id: string | null } | null)?.avatar_drive_id;
  if (!driveId) return new Response("sem avatar", { status: 404 });

  const drive = await fetchDriveMedia(driveId);
  if (!drive.ok) return new Response("falha no Drive", { status: 502 });

  const headers = new Headers();
  const ct = drive.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  // Avatar muda pouco; cache privado curto ajuda sem virar "cache de dados" (fora do escopo de perf).
  headers.set("cache-control", "private, max-age=3600");
  return new Response(drive.body, { status: 200, headers });
}
