import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { createResumableSession, verifyDriveFileInUserFolder } from "@/lib/drive";
import { recordingsTag } from "@/lib/cache-tags";
import {
  canView,
  canViewDeleted,
  canEditObservations,
  canDelete,
  canToggleVisibility,
  isModerator,
  type Actor,
} from "@/lib/rbac";
import type { ListState } from "@/lib/db";
import type { WriteResult } from "@/lib/workspaces";

// Rótulos de status (pt-br) movidos para um módulo PURO (client-safe) — a ilha da lista também usa.
// Re-exportados aqui para os imports server existentes (detalhe/listagem) seguirem funcionando.
export { STATUS_LABELS, statusLabel } from "@/lib/recording-status";

export interface RecordingTag {
  id: string;
  name: string;
}

export interface Recording {
  id: string;
  authorId: string;
  titulo: string | null;
  resumo: string | null; // frase que resume (gerada pelo back-p); nulo até processar
  status: string;
  visibilidade: "public" | "private";
  deleted: boolean;
  createdAt: string;
  areaId: string | null;
  areaName: string | null;
  authorNome: string | null;
  tags: RecordingTag[];
}

type Row = {
  id: string;
  author_id: string;
  titulo: string | null;
  resumo: string | null;
  status: string;
  visibilidade: "public" | "private";
  deleted: boolean;
  created_at: string;
  area_id: string | null;
  area: { name: string | null } | null;
  author: { nome: string | null } | null;
  tags: { tag: { id: string; name: string } | null }[] | null;
};

// Filtros da listagem (REQ-008). Tudo opcional; ausência = sem aquele filtro.
export interface RecordingFilters {
  search?: string; // busca textual no título
  areaId?: string; // uma área
  tagIds?: string[]; // múltiplas tags (semântica "qualquer uma" — DEV-012)
  onlyMine?: boolean; // toggle "só minhas / todas"
  includeDeleted?: boolean; // toggle "incluir deletadas" (respeita canViewDeleted)
}

const SELECT_COLS =
  "id,author_id,titulo,resumo,status,visibilidade,deleted,created_at,area_id, area:areas(name), author:profiles!author_id(nome), tags:recording_tags(tag:tags(id,name))";

function mapRow(r: Row): Recording {
  return {
    id: r.id,
    authorId: r.author_id,
    titulo: r.titulo,
    resumo: r.resumo,
    status: r.status,
    visibilidade: r.visibilidade,
    deleted: r.deleted,
    createdAt: r.created_at,
    areaId: r.area_id,
    areaName: r.area?.name ?? null,
    authorNome: r.author?.nome ?? null,
    tags: (r.tags ?? [])
      .map((rt) => rt.tag)
      .filter((t): t is { id: string; name: string } => t != null),
  };
}

// Leitura CRUA de TODAS as gravações do workspace (todo status/visibilidade/deleted), keyed só pelo
// workspaceId → cacheável (unstable_cache, tag `recordings:{ws}`). É ATOR-AGNÓSTICA de propósito: o
// RBAC NÃO entra aqui (entraria no cache e vazaria entre papéis). Lança em erro p/ não cachear falha
// transitória (projeto pausado etc. — APR-004); o caller traduz em "unavailable". DEC-018 / DEV-030.
function fetchWorkspaceRecordingsRaw(workspaceId: string): Promise<Recording[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabaseAdmin
        .from("recordings")
        .select(SELECT_COLS)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw new Error("recordings raw: " + error.message);
      return ((data ?? []) as unknown as Row[]).map(mapRow);
    },
    ["ws-recordings-raw", workspaceId],
    // TTL curto (~20s, abaixo do poll de 30s do AutoRefresh): a leitura cacheada expira entre polls,
    // então o `router.refresh()` passa a refletir escritas EXTERNAS (back-p, fora do Next → não chama
    // `updateTag`) SOZINHO, sem acoplamento back-p↔front (back-p Tópico G / APR-013). A(s) tag(s) e o
    // `updateTag` das mutações do front CONTINUAM dando read-your-own-writes instantâneo; o TTL cobre
    // só as escritas externas, com tolerância de ~1 ciclo (stale-while-revalidate, aceitável aqui). DEC-018.
    { tags: [recordingsTag(workspaceId)], revalidate: 20 }
  )();
}

// Lista as gravações do WORKSPACE ATIVO visíveis ao ator (RBAC no app — DEC-005/011/015), com filtros.
// Estratégia (DEC-018): a leitura crua por workspace é CACHEADA; o RBAC e os filtros rodam em JS sobre
// o conjunto cacheado (o ator nunca entra na chave do cache). Para os volumes do v1 é trivial; para
// escala, empurrar os filtros baratos de volta pro SQL (e cachear por filtro) — DEV-012.
export async function listRecordingsForActor(
  actor: Actor,
  filters: RecordingFilters = {}
): Promise<ListState<Recording>> {
  let raw: Recording[];
  try {
    raw = await fetchWorkspaceRecordingsRaw(actor.workspaceId);
  } catch {
    return { status: "unavailable" };
  }

  const wantTags = filters.tagIds && filters.tagIds.length > 0 ? new Set(filters.tagIds) : null;
  const search = filters.search?.trim().toLowerCase();

  const recs = raw.filter((r) => {
    // Deletadas: se o toggle "incluir deletadas" está off, nenhuma aparece (nem para moderador) —
    // preserva a semântica do filtro SQL anterior (eq deleted=false).
    if (!filters.includeDeleted && r.deleted) return false;
    // Política de visibilidade (DEC-015): autor sempre; outros só pós-processada conforme papel.
    if (!canView(actor, { authorId: r.authorId, visibilidade: r.visibilidade, status: r.status }))
      return false;
    // Deletadas só aparecem para moderador (owner/admin) — DEC-005 refinado na Fatia D.
    if (r.deleted && !canViewDeleted(actor)) return false;
    // Filtros baratos (antes no SQL): área, "só minhas", busca textual no título.
    if (filters.areaId && r.areaId !== filters.areaId) return false;
    if (filters.onlyMine && r.authorId !== actor.profileId) return false;
    if (search && !(r.titulo ?? "").toLowerCase().includes(search)) return false;
    // Filtro por tags (qualquer uma das selecionadas).
    if (wantTags && !r.tags.some((t) => wantTags.has(t.id))) return false;
    return true;
  });

  return { status: "ok", data: recs };
}

// ---- Detalhe (Fatia D2) ----------------------------------------------------

export interface RecordingDetail extends Recording {
  observacoes: string | null;
  duracaoSeg: number | null;
  driveFileId: string | null;
}

type DetailRow = Row & {
  observacoes: string | null;
  duracao_seg: number | null;
  drive_file_id: string | null;
};

export type DetailResult =
  | { status: "ok"; data: RecordingDetail }
  | { status: "not-found" } // não existe no workspace ativo, ou deletada que o ator não pode ver
  | { status: "forbidden" } // existe, mas a política não deixa o ator ver
  | { status: "unavailable" };

// Uma gravação do workspace ativo, com checagem de visibilidade (DEC-005/015). Reusado pelo
// detalhe e pelo route handler do áudio.
export async function getRecordingForActor(actor: Actor, id: string): Promise<DetailResult> {
  const { data, error } = await supabaseAdmin
    .from("recordings")
    .select(SELECT_COLS + ",observacoes,duracao_seg,drive_file_id")
    .eq("workspace_id", actor.workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: "unavailable" };
  if (!data) return { status: "not-found" };

  const row = data as unknown as DetailRow;
  const base = mapRow(row);
  const ref = {
    authorId: base.authorId,
    visibilidade: base.visibilidade,
    status: base.status,
    deleted: base.deleted,
  };
  if (base.deleted && !canViewDeleted(actor)) return { status: "not-found" };
  if (!canView(actor, ref)) return { status: "forbidden" };

  return {
    status: "ok",
    data: { ...base, observacoes: row.observacoes, duracaoSeg: row.duracao_seg, driveFileId: row.drive_file_id },
  };
}

// Saída do back-p para exibição no detalhe (REQ-009): transcrição (SRT/texto) + relatório (MD).
// Best-effort: ausência ou erro de leitura → null (o detalhe simplesmente não mostra a seção).
export interface RecordingOutputs {
  transcription: { srt: string | null; texto: string | null; api: string | null; model: string | null; idioma: string | null } | null;
  report: { relatorioMd: string | null; api: string | null; model: string | null } | null;
}

export async function getRecordingOutputs(workspaceId: string, recordingId: string): Promise<RecordingOutputs> {
  const [tr, rp] = await Promise.all([
    supabaseAdmin
      .from("transcriptions")
      .select("srt,texto,api,model,idioma")
      .eq("workspace_id", workspaceId)
      .eq("recording_id", recordingId)
      .maybeSingle(),
    supabaseAdmin
      .from("reports")
      .select("relatorio_md,api,model")
      .eq("workspace_id", workspaceId)
      .eq("recording_id", recordingId)
      .maybeSingle(),
  ]);
  const t = tr.error ? null : (tr.data as { srt: string | null; texto: string | null; api: string | null; model: string | null; idioma: string | null } | null);
  const r = rp.error ? null : (rp.data as { relatorio_md: string | null; api: string | null; model: string | null } | null);
  return {
    transcription: t ? { srt: t.srt, texto: t.texto, api: t.api, model: t.model, idioma: t.idioma } : null,
    report: r ? { relatorioMd: r.relatorio_md, api: r.api, model: r.model } : null,
  };
}

const touch = () => ({ updated_at: new Date().toISOString() });

// Editar observações — só o autor (DEC-005). REQ-010.
export async function updateObservations(
  actor: Actor,
  id: string,
  observacoes: string | null
): Promise<WriteResult> {
  const det = await getRecordingForActor(actor, id);
  if (det.status === "unavailable") return { status: "unavailable" };
  if (det.status !== "ok") return { status: "invalid", reason: "gravação não encontrada" };
  if (!canEditObservations(actor, det.data)) return { status: "invalid", reason: "sem permissão para editar" };
  const up = await supabaseAdmin
    .from("recordings")
    .update({ observacoes: observacoes?.trim() || null, ...touch() })
    .eq("id", id)
    .eq("workspace_id", actor.workspaceId);
  if (up.error) return { status: "unavailable" };
  return { status: "ok" };
}

// Soft-delete — collaborator só as próprias; owner/admin qualquer (DEC-005). REQ-011.
export async function softDeleteRecording(actor: Actor, id: string): Promise<WriteResult> {
  const det = await getRecordingForActor(actor, id);
  if (det.status === "unavailable") return { status: "unavailable" };
  if (det.status !== "ok") return { status: "invalid", reason: "gravação não encontrada" };
  if (!canDelete(actor, det.data)) return { status: "invalid", reason: "sem permissão para deletar" };
  const up = await supabaseAdmin
    .from("recordings")
    .update({ deleted: true, ...touch() })
    .eq("id", id)
    .eq("workspace_id", actor.workspaceId);
  if (up.error) return { status: "unavailable" };
  return { status: "ok" };
}

// Alternar público/privado — só owner/admin (moderação, DEC-015). REQ-014.
export async function setVisibility(
  actor: Actor,
  id: string,
  visibilidade: "public" | "private"
): Promise<WriteResult> {
  if (visibilidade !== "public" && visibilidade !== "private")
    return { status: "invalid", reason: "visibilidade inválida" };
  const det = await getRecordingForActor(actor, id);
  if (det.status === "unavailable") return { status: "unavailable" };
  if (det.status !== "ok") return { status: "invalid", reason: "gravação não encontrada" };
  if (!canToggleVisibility(actor)) return { status: "invalid", reason: "sem permissão para moderar" };
  const up = await supabaseAdmin
    .from("recordings")
    .update({ visibilidade, ...touch() })
    .eq("id", id)
    .eq("workspace_id", actor.workspaceId);
  if (up.error) return { status: "unavailable" };
  return { status: "ok" };
}

// Reatribuir a área de uma gravação — moderação (owner/admin). REQ-031/DEC-014.
export async function setRecordingArea(
  actor: Actor,
  id: string,
  areaId: string
): Promise<WriteResult> {
  if (!isModerator(actor)) return { status: "invalid", reason: "sem permissão para moderar" };
  const area = await supabaseAdmin
    .from("areas")
    .select("id")
    .eq("id", areaId)
    .eq("workspace_id", actor.workspaceId)
    .maybeSingle();
  if (area.error) return { status: "unavailable" };
  if (!area.data) return { status: "invalid", reason: "área inválida" };
  const up = await supabaseAdmin
    .from("recordings")
    .update({ area_id: areaId, ...touch() })
    .eq("id", id)
    .eq("workspace_id", actor.workspaceId);
  if (up.error) return { status: "unavailable" };
  return { status: "ok" };
}

// Cria uma gravação do ator no workspace ativo, herdando a área do membro (DEC-014).
// (status inicial vem do default do schema: awaiting_processing.)
export async function createRecording(
  actor: Actor,
  input: { titulo?: string | null }
): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from("recordings")
    .insert({
      workspace_id: actor.workspaceId,
      author_id: actor.profileId,
      area_id: actor.areaId,
      titulo: input.titulo ?? null,
    })
    .select("id")
    .single();
  return (data as { id: string }) ?? null;
}

// Nome do workspace (para a pasta do Drive, DEC-009).
async function getWorkspaceName(workspaceId: string): Promise<string> {
  const wsRow = await supabaseAdmin
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();
  return (wsRow.data as { name: string } | null)?.name ?? "workspace";
}

// Nome do arquivo de áudio no Drive: título (ou "gravacao") + timestamp + extensão.
function buildAudioFilename(titulo: string | null, ext: string): string {
  const base = titulo?.trim() || "gravacao";
  return `${base}-${Date.now()}.${ext}`;
}

// PASSO 1 do upload (REQ-006): abre a sessão de upload resumível e devolve só a session URI. O áudio
// sobe DEPOIS, do browser DIRETO pro Drive (não passa pelo servidor → sem o cap ~4.5MB da Vercel).
// O caller (Server Action) pré-checa ator/perfil ANTES (anti-órfão no Drive, DEC-012).
export async function createUploadSessionForActor(input: {
  actor: Actor;
  userLabel: string;
  mimeType: string;
  ext: string;
  titulo: string | null;
  origin: string;
}): Promise<{ sessionUrl: string }> {
  const wsName = await getWorkspaceName(input.actor.workspaceId);
  const { sessionUrl } = await createResumableSession({
    workspace: { id: input.actor.workspaceId, name: wsName },
    user: { id: input.actor.profileId, label: input.userLabel },
    filename: buildAudioFilename(input.titulo, input.ext),
    mimeType: input.mimeType,
    origin: input.origin,
  });
  return { sessionUrl };
}

// PASSO 2 do upload (REQ-006/007): o browser já subiu o áudio e devolveu o fileId. Verifica que o
// arquivo está na pasta do próprio usuário (impede forjar id) e cria a entrada (awaiting_processing).
export async function finalizeRecordingForActor(input: {
  actor: Actor;
  userLabel: string;
  fileId: string;
  titulo: string | null;
  observacoes: string | null;
  duracaoSeg: number | null;
  sizeBytes: number | null;
}): Promise<{ id: string }> {
  const wsName = await getWorkspaceName(input.actor.workspaceId);
  const { ok, folderId } = await verifyDriveFileInUserFolder({
    fileId: input.fileId,
    workspace: { id: input.actor.workspaceId, name: wsName },
    user: { id: input.actor.profileId, label: input.userLabel },
  });
  if (!ok) throw new Error("arquivo de áudio inválido ou fora da pasta do usuário");
  const { data, error } = await supabaseAdmin
    .from("recordings")
    .insert({
      workspace_id: input.actor.workspaceId,
      author_id: input.actor.profileId,
      area_id: input.actor.areaId,
      titulo: input.titulo,
      observacoes: input.observacoes,
      duracao_seg: input.duracaoSeg,
      size_bytes: input.sizeBytes,
      drive_file_id: input.fileId,
      drive_folder_id: folderId,
    })
    .select("id")
    .single();
  if (error) throw new Error("insert recording: " + error.message);
  return { id: (data as { id: string }).id };
}
