// Estado de leituras que dependem do backend (Supabase). Ver DEC-012 / REQ-023.
// Motivação: o cliente supabase-js NÃO lança em falha de rede — retorna { data, error }
// (projeto pausado → ENOTFOUND com `error` populado; ver OBS-006/APR-004). Antes, o código
// descartava o `error` e "DB fora" virava o mesmo `null` de "sem perfil" (logado mas `role: —`).

export class BackendUnavailableError extends Error {
  constructor(detail?: string) {
    super("backend indisponível" + (detail ? `: ${detail}` : ""));
    this.name = "BackendUnavailableError";
  }
}

// Leitura de UMA linha. Use sempre `.maybeSingle()`: sem linha → data null SEM error
// (com `.single()`, "zero linhas" vira error e seria confundido com indisponibilidade).
export type ReadState<T> =
  | { status: "ok"; data: T }
  | { status: "missing" } // consulta OK, nenhuma linha
  | { status: "unavailable" }; // backend inalcançável / consulta falhou

// Classifica pelo `error` (não por timeout — DEC-012): qualquer erro de leitura ⇒ indisponível.
export function classifyRead<T>(res: { data: unknown; error: unknown }): ReadState<T> {
  if (res.error) return { status: "unavailable" };
  if (res.data == null) return { status: "missing" };
  return { status: "ok", data: res.data as T };
}

// Estado de algo lido para a sessão do usuário (acrescenta a dimensão de auth ao ReadState).
export type SessionState<T> =
  | { status: "ok"; data: T }
  | { status: "unauthenticated" }
  | { status: "no-profile" } // sessão válida, mas sem linha de perfil (não deveria passar o portão)
  | { status: "no-workspace" } // autenticado, mas sem workspace ativo: member não-onboardado / guest sem adesão ativa
  | { status: "unavailable" };

// Estado de uma listagem (lista vazia é "ok", não "missing").
export type ListState<T> =
  | { status: "ok"; data: T[] }
  | { status: "unavailable" };
