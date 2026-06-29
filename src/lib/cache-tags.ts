import "server-only";

// Tags do cache de dados (unstable_cache), por WORKSPACE. Centralizadas aqui para a invalidação
// (revalidateTag) bater EXATAMENTE com o que foi cacheado nas leituras. Cache keyed por workspace,
// nunca pelo ator — o RBAC fica fora do cache (DEC-018 / DEV-030).
//
// Matriz de invalidação (qual mutação invalida o quê):
//   saveRecording / softDelete / setVisibility / updateObservations / setRecordingArea → recordings
//   createArea → areas + tags (cria tag homônima)
//   renameArea → areas + recordings (nome da área é denormalizado na lista)
//   deleteArea → areas + members + recordings (reatribui gravações e membros para "Todas")
//   createTag → tags ; renameTag / deleteTag → tags + recordings (nome/vínculo denormalizados)
//   setMemberArea → members
export const recordingsTag = (workspaceId: string) => `recordings:${workspaceId}`;
export const areasTag = (workspaceId: string) => `areas:${workspaceId}`;
export const tagsTag = (workspaceId: string) => `tags:${workspaceId}`;
export const membersTag = (workspaceId: string) => `members:${workspaceId}`;
