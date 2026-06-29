import { supabaseAdmin } from "@/lib/supabase";
import { normalizeTagName, normalizeAreaName } from "@/lib/taxonomy";

// Tags do sistema semeadas em todo workspace (DEC-014). Já em forma normalizada (minúsculas).
export const SYSTEM_TAGS = ["problema", "ideia", "sugestão", "dúvida", "decisão", "pendência"];

export const MAX_WORKSPACES_PER_OWNER = 10; // DEC-013

export type WriteResult<T = unknown> =
  | ({ status: "ok" } & T)
  | { status: "unavailable" }
  | { status: "invalid"; reason: string };

// Cria um workspace completo: áreas (default "Todas" + custom), tags (sistema + custom + homônimas das
// áreas custom, DEC-014), adesão owner active, e ativa o workspace pro criador (first_access=false).
// Usado no onboarding do member e na criação de workspace adicional. Inserts SEQUENCIAIS (não um CTE só)
// para evitar o snapshot que esconde linhas recém-inseridas (APR-005).
export async function createWorkspace(
  ownerProfileId: string,
  input: { name: string; extraTags?: string[]; extraAreas?: string[] }
): Promise<WriteResult<{ workspaceId: string }>> {
  const name = input.name?.trim();
  if (!name) return { status: "invalid", reason: "nome do workspace vazio" };

  const cnt = await supabaseAdmin
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerProfileId);
  if (cnt.error) return { status: "unavailable" };
  if ((cnt.count ?? 0) >= MAX_WORKSPACES_PER_OWNER)
    return { status: "invalid", reason: `limite de ${MAX_WORKSPACES_PER_OWNER} workspaces atingido` };

  const ws = await supabaseAdmin
    .from("workspaces")
    .insert({ name, owner_id: ownerProfileId })
    .select("id")
    .single();
  if (ws.error || !ws.data) return { status: "unavailable" };
  const workspaceId = (ws.data as { id: string }).id;

  // Áreas custom: normalizadas (1ª maiúscula), únicas, sem repetir a default "Todas".
  const cleanAreas = [
    ...new Set((input.extraAreas ?? []).map(normalizeAreaName).filter((a) => a && a !== "Todas")),
  ];
  const areaRows = [
    { workspace_id: workspaceId, name: "Todas", is_default: true },
    ...cleanAreas.map((n) => ({ workspace_id: workspaceId, name: n, is_default: false })),
  ];
  const ar = await supabaseAdmin.from("areas").insert(areaRows).select("id,name,is_default");
  if (ar.error || !ar.data) return { status: "unavailable" };
  const todas = (ar.data as { id: string; is_default: boolean }[]).find((a) => a.is_default);

  // tags do sistema (source=system) + tags do usuário: extras + homônimas das áreas custom (DEC-014),
  // tudo normalizado (minúsculas) e sem colidir com as do sistema.
  const userTagNames = new Set<string>([
    ...(input.extraTags ?? []).map(normalizeTagName).filter(Boolean),
    ...cleanAreas.map(normalizeTagName),
  ]);
  SYSTEM_TAGS.forEach((s) => userTagNames.delete(s));
  const tagRows = [
    ...SYSTEM_TAGS.map((n) => ({ workspace_id: workspaceId, name: n, source: "system" as const })),
    ...[...userTagNames].map((n) => ({
      workspace_id: workspaceId,
      name: n,
      source: "user" as const,
      created_by: ownerProfileId,
    })),
  ];
  const tg = await supabaseAdmin.from("tags").insert(tagRows);
  if (tg.error) return { status: "unavailable" };

  const mem = await supabaseAdmin.from("workspace_members").insert({
    workspace_id: workspaceId,
    profile_id: ownerProfileId,
    workspace_role: "owner",
    status: "active",
    area_id: todas?.id ?? null,
  });
  if (mem.error) return { status: "unavailable" };

  const up = await supabaseAdmin
    .from("profiles")
    .update({ last_workspace_id: workspaceId, first_access: false })
    .eq("id", ownerProfileId);
  if (up.error) return { status: "unavailable" };

  return { status: "ok", workspaceId };
}

// Aceita um convite (guest ou member convidado): invited→active e ativa o workspace (DEC-008).
export async function acceptInvite(
  profileId: string,
  workspaceId: string
): Promise<WriteResult> {
  const upd = await supabaseAdmin
    .from("workspace_members")
    .update({ status: "active" })
    .eq("profile_id", profileId)
    .eq("workspace_id", workspaceId)
    .eq("status", "invited")
    .select("id")
    .maybeSingle();
  if (upd.error) return { status: "unavailable" };
  if (!upd.data) return { status: "invalid", reason: "convite não encontrado" };

  const up = await supabaseAdmin
    .from("profiles")
    .update({ last_workspace_id: workspaceId })
    .eq("id", profileId);
  if (up.error) return { status: "unavailable" };
  return { status: "ok" };
}

export interface WorkspaceRef {
  workspaceId: string;
  name: string;
  role: string;
}

// Convites pendentes (status invited) do perfil.
export async function listPendingInvites(
  profileId: string
): Promise<{ status: "ok"; invites: WorkspaceRef[] } | { status: "unavailable" }> {
  const res = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, workspace_role, workspaces(name)")
    .eq("profile_id", profileId)
    .eq("status", "invited");
  if (res.error) return { status: "unavailable" };
  const invites = ((res.data ?? []) as unknown as {
    workspace_id: string;
    workspace_role: string;
    workspaces: { name: string } | null;
  }[]).map((r) => ({
    workspaceId: r.workspace_id,
    role: r.workspace_role,
    name: r.workspaces?.name ?? "(sem nome)",
  }));
  return { status: "ok", invites };
}

// Workspaces ativos do perfil (para o seletor/troca).
export async function listMyWorkspaces(
  profileId: string
): Promise<{ status: "ok"; workspaces: WorkspaceRef[] } | { status: "unavailable" }> {
  const res = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, workspace_role, workspaces(name)")
    .eq("profile_id", profileId)
    .eq("status", "active");
  if (res.error) return { status: "unavailable" };
  const workspaces = ((res.data ?? []) as unknown as {
    workspace_id: string;
    workspace_role: string;
    workspaces: { name: string } | null;
  }[]).map((r) => ({
    workspaceId: r.workspace_id,
    role: r.workspace_role,
    name: r.workspaces?.name ?? "(sem nome)",
  }));
  return { status: "ok", workspaces };
}

// Troca o workspace ativo — valida que há adesão ATIVA antes de setar (DEC-013).
export async function setActiveWorkspace(
  profileId: string,
  workspaceId: string
): Promise<WriteResult> {
  const m = await supabaseAdmin
    .from("workspace_members")
    .select("id")
    .eq("profile_id", profileId)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle();
  if (m.error) return { status: "unavailable" };
  if (!m.data) return { status: "invalid", reason: "você não é membro ativo desse workspace" };

  const up = await supabaseAdmin
    .from("profiles")
    .update({ last_workspace_id: workspaceId })
    .eq("id", profileId);
  if (up.error) return { status: "unavailable" };
  return { status: "ok" };
}
