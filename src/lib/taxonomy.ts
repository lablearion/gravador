import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { areasTag, tagsTag, membersTag } from "@/lib/cache-tags";
import { isModerator, type Actor } from "@/lib/rbac";
import type { WriteResult } from "@/lib/workspaces";

const invalid = <T = unknown>(reason: string): WriteResult<T> => ({ status: "invalid", reason });
const UNIQUE_VIOLATION = "23505";

// Origem de uma tag: seed do sistema, criada por um usuário, ou sugerida/criada por IA (back-p).
export type TagSource = "system" | "user" | "ai";

// Normalização antes de gravar (evita duplicatas por casing/espaço). Aplicada em criar/renomear.
// Tags: minúsculas (categorias, como o seed problema/ideia/…). Áreas: 1ª maiúscula (rótulos, como "Todas").
export const normalizeTagName = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();
export const normalizeAreaName = (s: string): string => {
  const t = s.trim().replace(/\s+/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};

// Leitura da taxonomia de um workspace (áreas e tags), para os filtros da listagem (Fatia D1)
// e o CRUD de Áreas & Tags (Fatia D3). Acesso server-side (DEC-011).

export interface AreaRef {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface TagRef {
  id: string;
  name: string;
  source: TagSource;
}

// Leitura cacheada da taxonomia, keyed só pelo workspaceId (unstable_cache + tag) — DEC-018/DEV-030.
// Lança em erro p/ não cachear falha transitória (APR-004); o caller traduz em "unavailable".

function fetchAreasRaw(workspaceId: string): Promise<AreaRef[]> {
  return unstable_cache(
    async () => {
      const res = await supabaseAdmin
        .from("areas")
        .select("id,name,is_default")
        .eq("workspace_id", workspaceId)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      if (res.error) throw new Error("areas: " + res.error.message);
      return ((res.data ?? []) as { id: string; name: string; is_default: boolean }[]).map((a) => ({
        id: a.id,
        name: a.name,
        isDefault: a.is_default,
      }));
    },
    ["ws-areas", workspaceId],
    { tags: [areasTag(workspaceId)] }
  )();
}

function fetchTagsRaw(workspaceId: string): Promise<TagRef[]> {
  return unstable_cache(
    async () => {
      const res = await supabaseAdmin
        .from("tags")
        .select("id,name,source")
        .eq("workspace_id", workspaceId)
        .order("name", { ascending: true });
      if (res.error) throw new Error("tags: " + res.error.message);
      // Sistema primeiro, depois alfabético (ordenação de exibição feita no app).
      return ((res.data ?? []) as { id: string; name: string; source: TagSource }[])
        .map((t) => ({ id: t.id, name: t.name, source: t.source }))
        .sort((a, b) => {
          if (a.source === "system" && b.source !== "system") return -1;
          if (a.source !== "system" && b.source === "system") return 1;
          return a.name.localeCompare(b.name);
        });
    },
    ["ws-tags", workspaceId],
    { tags: [tagsTag(workspaceId)] }
  )();
}

// Áreas do workspace (default "Todas" primeiro, depois alfabético).
export async function listAreas(
  workspaceId: string
): Promise<{ status: "ok"; areas: AreaRef[] } | { status: "unavailable" }> {
  try {
    return { status: "ok", areas: await fetchAreasRaw(workspaceId) };
  } catch {
    return { status: "unavailable" };
  }
}

// Tags do workspace (sistema primeiro, depois alfabético).
export async function listTags(
  workspaceId: string
): Promise<{ status: "ok"; tags: TagRef[] } | { status: "unavailable" }> {
  try {
    return { status: "ok", tags: await fetchTagsRaw(workspaceId) };
  } catch {
    return { status: "unavailable" };
  }
}

// Membros ativos do workspace (para mover a área de cada um — REQ-031).
export interface MemberRef {
  profileId: string;
  nome: string | null;
  email: string;
  role: string;
  areaId: string | null;
  areaName: string | null;
}

function fetchMembersRaw(workspaceId: string): Promise<MemberRef[]> {
  return unstable_cache(
    async () => {
      const res = await supabaseAdmin
        .from("workspace_members")
        .select("profile_id, workspace_role, area_id, profile:profiles!profile_id(nome,email), area:areas(name)")
        .eq("workspace_id", workspaceId)
        .eq("status", "active");
      if (res.error) throw new Error("members: " + res.error.message);
      return ((res.data ?? []) as unknown as {
        profile_id: string;
        workspace_role: string;
        area_id: string | null;
        profile: { nome: string | null; email: string } | null;
        area: { name: string | null } | null;
      }[]).map((m) => ({
        profileId: m.profile_id,
        nome: m.profile?.nome ?? null,
        email: m.profile?.email ?? "",
        role: m.workspace_role,
        areaId: m.area_id,
        areaName: m.area?.name ?? null,
      }));
    },
    ["ws-members", workspaceId],
    { tags: [membersTag(workspaceId)] }
  )();
}

export async function listWorkspaceMembers(
  workspaceId: string
): Promise<{ status: "ok"; members: MemberRef[] } | { status: "unavailable" }> {
  try {
    return { status: "ok", members: await fetchMembersRaw(workspaceId) };
  } catch {
    return { status: "unavailable" };
  }
}

// ---- Mutações de taxonomia (owner/admin — DEC-005/014). Fatia D3. ----------

async function defaultAreaId(workspaceId: string): Promise<string | null> {
  const r = await supabaseAdmin
    .from("areas")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .maybeSingle();
  return (r.data as { id: string } | null)?.id ?? null;
}

// Criar área + tag homônima (DEC-014). A tag homônima é best-effort: se já existir, segue.
export async function createArea(actor: Actor, name: string): Promise<WriteResult<{ areaId: string }>> {
  if (!isModerator(actor)) return invalid("sem permissão");
  const n = normalizeAreaName(name);
  if (!n) return invalid("nome da área vazio");

  const ar = await supabaseAdmin
    .from("areas")
    .insert({ workspace_id: actor.workspaceId, name: n, is_default: false })
    .select("id")
    .single();
  if (ar.error) {
    if (ar.error.code === UNIQUE_VIOLATION) return invalid("já existe uma área com esse nome");
    return { status: "unavailable" };
  }
  // Tag homônima (DEC-014), normalizada como tag (minúscula): área "Vendas" → tag "vendas".
  // Best-effort: ignora violação de unicidade (já existe uma tag com esse nome).
  await supabaseAdmin
    .from("tags")
    .insert({ workspace_id: actor.workspaceId, name: normalizeTagName(name), source: "user", created_by: actor.profileId });
  return { status: "ok", areaId: (ar.data as { id: string }).id };
}

export async function renameArea(actor: Actor, areaId: string, name: string): Promise<WriteResult> {
  if (!isModerator(actor)) return invalid("sem permissão");
  const n = normalizeAreaName(name);
  if (!n) return invalid("nome da área vazio");
  const a = await supabaseAdmin
    .from("areas")
    .select("is_default")
    .eq("id", areaId)
    .eq("workspace_id", actor.workspaceId)
    .maybeSingle();
  if (a.error) return { status: "unavailable" };
  if (!a.data) return invalid("área não encontrada");
  if ((a.data as { is_default: boolean }).is_default) return invalid("a área padrão não pode ser renomeada");
  const up = await supabaseAdmin
    .from("areas")
    .update({ name: n })
    .eq("id", areaId)
    .eq("workspace_id", actor.workspaceId);
  if (up.error) {
    if (up.error.code === UNIQUE_VIOLATION) return invalid("já existe uma área com esse nome");
    return { status: "unavailable" };
  }
  return { status: "ok" };
}

// Deletar área (não a default). Gravações e membros na área voltam para "Todas" (REQ-031).
export async function deleteArea(actor: Actor, areaId: string): Promise<WriteResult> {
  if (!isModerator(actor)) return invalid("sem permissão");
  const a = await supabaseAdmin
    .from("areas")
    .select("is_default")
    .eq("id", areaId)
    .eq("workspace_id", actor.workspaceId)
    .maybeSingle();
  if (a.error) return { status: "unavailable" };
  if (!a.data) return invalid("área não encontrada");
  if ((a.data as { is_default: boolean }).is_default) return invalid("a área padrão não pode ser deletada");

  const todasId = await defaultAreaId(actor.workspaceId);
  // Reatribui antes de deletar (a FK é ON DELETE SET NULL; aqui queremos "Todas", não null) — REQ-031.
  const rRec = await supabaseAdmin
    .from("recordings")
    .update({ area_id: todasId })
    .eq("workspace_id", actor.workspaceId)
    .eq("area_id", areaId);
  if (rRec.error) return { status: "unavailable" };
  const rMem = await supabaseAdmin
    .from("workspace_members")
    .update({ area_id: todasId })
    .eq("workspace_id", actor.workspaceId)
    .eq("area_id", areaId);
  if (rMem.error) return { status: "unavailable" };

  const del = await supabaseAdmin
    .from("areas")
    .delete()
    .eq("id", areaId)
    .eq("workspace_id", actor.workspaceId);
  if (del.error) return { status: "unavailable" };
  return { status: "ok" };
}

// Criar tag manual (REQ-026 — criar manual = Next.js).
export async function createTag(actor: Actor, name: string): Promise<WriteResult<{ tagId: string }>> {
  if (!isModerator(actor)) return invalid("sem permissão");
  const n = normalizeTagName(name);
  if (!n) return invalid("nome da tag vazio");
  const tg = await supabaseAdmin
    .from("tags")
    .insert({ workspace_id: actor.workspaceId, name: n, source: "user", created_by: actor.profileId })
    .select("id")
    .single();
  if (tg.error) {
    if (tg.error.code === UNIQUE_VIOLATION) return invalid("já existe uma tag com esse nome");
    return { status: "unavailable" };
  }
  return { status: "ok", tagId: (tg.data as { id: string }).id };
}

// Renomear tag — não as do sistema (seed). Normaliza e checa duplicata (REQ-026).
export async function renameTag(actor: Actor, tagId: string, name: string): Promise<WriteResult> {
  if (!isModerator(actor)) return invalid("sem permissão");
  const n = normalizeTagName(name);
  if (!n) return invalid("nome da tag vazio");
  const t = await supabaseAdmin
    .from("tags")
    .select("source")
    .eq("id", tagId)
    .eq("workspace_id", actor.workspaceId)
    .maybeSingle();
  if (t.error) return { status: "unavailable" };
  if (!t.data) return invalid("tag não encontrada");
  if ((t.data as { source: TagSource }).source === "system")
    return invalid("tags do sistema não podem ser renomeadas");
  const up = await supabaseAdmin
    .from("tags")
    .update({ name: n })
    .eq("id", tagId)
    .eq("workspace_id", actor.workspaceId);
  if (up.error) {
    if (up.error.code === UNIQUE_VIOLATION) return invalid("já existe uma tag com esse nome");
    return { status: "unavailable" };
  }
  return { status: "ok" };
}

// Deletar tag — não as do sistema (seed). Vínculos em recording_tags caem por cascade.
export async function deleteTag(actor: Actor, tagId: string): Promise<WriteResult> {
  if (!isModerator(actor)) return invalid("sem permissão");
  const t = await supabaseAdmin
    .from("tags")
    .select("source")
    .eq("id", tagId)
    .eq("workspace_id", actor.workspaceId)
    .maybeSingle();
  if (t.error) return { status: "unavailable" };
  if (!t.data) return invalid("tag não encontrada");
  if ((t.data as { source: TagSource }).source === "system")
    return invalid("tags do sistema não podem ser deletadas");
  const del = await supabaseAdmin
    .from("tags")
    .delete()
    .eq("id", tagId)
    .eq("workspace_id", actor.workspaceId);
  if (del.error) return { status: "unavailable" };
  return { status: "ok" };
}

// Mover a área de um membro (REQ-031). areaId deve ser uma área do mesmo workspace.
export async function setMemberArea(
  actor: Actor,
  profileId: string,
  areaId: string
): Promise<WriteResult> {
  if (!isModerator(actor)) return invalid("sem permissão");
  const a = await supabaseAdmin
    .from("areas")
    .select("id")
    .eq("id", areaId)
    .eq("workspace_id", actor.workspaceId)
    .maybeSingle();
  if (a.error) return { status: "unavailable" };
  if (!a.data) return invalid("área inválida");
  const up = await supabaseAdmin
    .from("workspace_members")
    .update({ area_id: areaId })
    .eq("workspace_id", actor.workspaceId)
    .eq("profile_id", profileId);
  if (up.error) return { status: "unavailable" };
  return { status: "ok" };
}
