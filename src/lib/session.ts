import { cache } from "react";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { classifyRead, type SessionState } from "@/lib/db";
import type { Actor, WorkspaceRole } from "@/lib/rbac";

async function sessionUserId(): Promise<string | null> {
  const s = await auth();
  return (s?.user as { id?: string } | undefined)?.id ?? null;
}

// Ator autenticado, resolvido para o WORKSPACE ATIVO (last_workspace_id) e o papel nele.
// O papel vem SEMPRE do banco (DEC-011): mudança de papel vale na hora, sem relogar.
// Estados (DEC-012): ok | unauthenticated | no-profile | no-workspace | unavailable.
// `cache()` do React = dedup POR REQUISIÇÃO (layout + page chamam getActor no mesmo render): roda
// 1x por request, não persiste entre requests (depende de cookie — não cacheável de verdade). DEV-030.
export const getActor = cache(async (): Promise<SessionState<Actor>> => {
  const id = await sessionUserId();
  if (!id) return { status: "unauthenticated" };

  const pr = classifyRead<{ last_workspace_id: string | null }>(
    await supabaseAdmin.from("profiles").select("last_workspace_id").eq("id", id).maybeSingle()
  );
  if (pr.status === "unavailable") return { status: "unavailable" };
  if (pr.status === "missing") return { status: "no-profile" };

  const wsId = pr.data.last_workspace_id;
  if (!wsId) return { status: "no-workspace" };

  const mr = classifyRead<{ workspace_role: WorkspaceRole; area_id: string | null }>(
    await supabaseAdmin
      .from("workspace_members")
      .select("workspace_role,area_id")
      .eq("profile_id", id)
      .eq("workspace_id", wsId)
      .eq("status", "active")
      .maybeSingle()
  );
  if (mr.status === "unavailable") return { status: "unavailable" };
  if (mr.status === "missing") return { status: "no-workspace" }; // ws ativo aponta, mas sem adesão ativa

  return {
    status: "ok",
    data: { profileId: id, workspaceId: wsId, role: mr.data.workspace_role, areaId: mr.data.area_id },
  };
});

export interface CurrentProfile {
  id: string;
  nome: string | null;
  sobrenome: string | null;
  email: string;
  accountLevel: "member" | "guest";
  firstAccess: boolean;
  lastWorkspaceId: string | null;
  avatarDriveId: string | null;
}

// Perfil completo do usuário logado (busca fresca no banco). Mesmos estados de getActor (menos workspace).
// `cache()` = dedup por requisição (layout + actions chamam no mesmo render). DEV-030.
export const getCurrentProfile = cache(async (): Promise<SessionState<CurrentProfile>> => {
  const id = await sessionUserId();
  if (!id) return { status: "unauthenticated" };
  const r = classifyRead<{
    id: string;
    nome: string | null;
    sobrenome: string | null;
    email: string;
    account_level: "member" | "guest";
    first_access: boolean;
    last_workspace_id: string | null;
    avatar_drive_id: string | null;
  }>(
    await supabaseAdmin
      .from("profiles")
      .select("id,nome,sobrenome,email,account_level,first_access,last_workspace_id,avatar_drive_id")
      .eq("id", id)
      .maybeSingle()
  );
  if (r.status === "unavailable") return { status: "unavailable" };
  if (r.status === "missing") return { status: "no-profile" };
  return {
    status: "ok",
    data: {
      id: r.data.id,
      nome: r.data.nome,
      sobrenome: r.data.sobrenome,
      email: r.data.email,
      accountLevel: r.data.account_level,
      firstAccess: r.data.first_access,
      lastWorkspaceId: r.data.last_workspace_id,
      avatarDriveId: r.data.avatar_drive_id,
    },
  };
});

// "Nome Sobrenome" para rotular a subpasta do usuário no Drive; cai pro email se vazio.
export function userFolderLabel(p: CurrentProfile): string {
  const label = `${p.nome ?? ""} ${p.sobrenome ?? ""}`.trim();
  return label || p.email;
}
