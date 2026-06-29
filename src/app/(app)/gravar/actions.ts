"use server";

import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { getActor, getCurrentProfile, userFolderLabel } from "@/lib/session";
import { createUploadSessionForActor, finalizeRecordingForActor } from "@/lib/recordings";
import { recordingsTag } from "@/lib/cache-tags";

function extFromMime(mimeType: string): string {
  return mimeType.includes("mp4") || mimeType.includes("mpeg") ? "m4a" : "webm";
}

const UNAVAILABLE = "Serviço temporariamente indisponível. Tente novamente em alguns minutos.";

// PASSO 1: abre a sessão de upload resumível (browser→Drive). Pré-checa ator/perfil ANTES de criar a
// sessão no Drive (anti-órfão, DEC-012): com backend fora, nem começa. Devolve só a session URI — o
// segredo do Drive nunca vai ao cliente. O áudio sobe direto do browser (sem o cap ~4.5MB da Vercel).
export async function createUploadSessionAction(input: {
  mimeType: string;
  titulo: string | null;
}): Promise<{ sessionUrl: string }> {
  const actor = await getActor();
  if (actor.status === "unavailable") throw new Error(UNAVAILABLE);
  if (actor.status !== "ok") throw new Error("não autenticado ou sem workspace ativo");

  const prof = await getCurrentProfile();
  if (prof.status === "unavailable") throw new Error(UNAVAILABLE);
  if (prof.status !== "ok") throw new Error("perfil indisponível");

  // Origem da app (= origem de onde o browser dará o PUT) → faz o Google liberar CORS na sessão.
  const origin = (await headers()).get("origin");
  if (!origin) throw new Error("origem da requisição ausente");

  const mimeType = input.mimeType || "audio/webm";
  return createUploadSessionForActor({
    actor: actor.data,
    userLabel: userFolderLabel(prof.data),
    mimeType,
    ext: extFromMime(mimeType),
    titulo: (input.titulo || "").trim() || null,
    origin,
  });
}

// PASSO 2: o áudio já subiu (browser→Drive). Cria a entrada (awaiting_processing) e invalida o cache.
export async function finalizeRecordingAction(input: {
  fileId: string;
  titulo: string | null;
  observacoes: string | null;
  duracao: number | null;
}): Promise<{ id: string }> {
  const actor = await getActor();
  if (actor.status === "unavailable") throw new Error(UNAVAILABLE);
  if (actor.status !== "ok") throw new Error("não autenticado ou sem workspace ativo");

  const prof = await getCurrentProfile();
  if (prof.status === "unavailable") throw new Error(UNAVAILABLE);
  if (prof.status !== "ok") throw new Error("perfil indisponível");

  if (!input.fileId) throw new Error("sem arquivo");

  const r = await finalizeRecordingForActor({
    actor: actor.data,
    userLabel: userFolderLabel(prof.data),
    fileId: input.fileId,
    titulo: (input.titulo || "").trim() || null,
    observacoes: (input.observacoes || "").trim() || null,
    duracaoSeg: input.duracao || null,
  });
  // Read-your-own-writes: expira já a lista cacheada do workspace → a nova gravação aparece na
  // próxima visita sem servir conteúdo velho (updateTag, só em Server Action). DEC-018/DEV-030.
  updateTag(recordingsTag(actor.data.workspaceId));
  return { id: r.id };
}
