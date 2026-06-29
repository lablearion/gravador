// Módulo de política RBAC — fonte única das regras (DEC-005, aplicado server-side por DEC-011).
// Papéis DENTRO de um workspace: collaborator < admin < owner. O ator já vem resolvido
// para o workspace ATIVO (ver session.getActor). Não há mais hierarquia global.

export type WorkspaceRole = "owner" | "admin" | "collaborator";

const RANK: Record<WorkspaceRole, number> = { collaborator: 1, admin: 2, owner: 3 };

// Quem age, já amarrado a um workspace ativo e ao seu papel nele.
export interface Actor {
  profileId: string;
  workspaceId: string;
  role: WorkspaceRole;
  areaId: string | null; // área do membro no workspace ativo (herdada pela gravação)
}

// Referência mínima de uma gravação para decisões de política.
export interface RecordingRef {
  authorId: string;
  visibilidade: "public" | "private";
  status: string; // awaiting_processing | processing | done | error
  deleted?: boolean;
}

export const isModerator = (a: Actor) => a.role === "owner" || a.role === "admin";
const isAuthor = (a: Actor, r: RecordingRef) => a.profileId === r.authorId;

// "Processada" = disponível aos outros membros (DEC-015/REQ-027). Antes disso, só o autor vê.
const isAvailableToOthers = (r: RecordingRef) => r.status === "done";

/**
 * Ver na listagem/detalhe:
 * - o autor sempre vê a sua;
 * - para os OUTROS, a gravação só aparece depois de processada (disponibilidade, DEC-015/REQ-027);
 * - já processada: owner/admin veem tudo (inclusive privadas); collaborator vê as públicas.
 */
export function canView(a: Actor, r: RecordingRef): boolean {
  if (isAuthor(a, r)) return true;
  if (!isAvailableToOthers(r)) return false;
  if (isModerator(a)) return true;
  return r.visibilidade === "public";
}

/** Alternar público/privado — só owner/admin (moderação). DEC-015. */
export function canToggleVisibility(a: Actor): boolean {
  return isModerator(a);
}

/** Editar observações — apenas as próprias. DEC-005. */
export function canEditObservations(a: Actor, r: RecordingRef): boolean {
  return isAuthor(a, r);
}

/** Soft-delete — collaborator só as próprias; owner/admin qualquer (moderação). DEC-005/011. */
export function canDelete(a: Actor, r: RecordingRef): boolean {
  return isModerator(a) || isAuthor(a, r);
}

/** Ver deletadas (filtro "incluir deletadas") — SÓ owner/admin (DEC-005, refinado na Fatia D).
 *  Collaborator não vê deletadas (nem as próprias); o toggle nem aparece pra ele. */
export function canViewDeleted(a: Actor): boolean {
  return isModerator(a);
}

/** Gestão de membros/área/config age sobre papéis ESTRITAMENTE abaixo (DEC-005). */
export function canManageRole(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  return RANK[actorRole] > RANK[targetRole];
}
