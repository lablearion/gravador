import { supabaseAdmin } from "@/lib/supabase";

// Para onde mandar o usuário logado, conforme seu estado (DEC-008):
//  - "ok"         → tem workspace ativo, segue pro app
//  - "onboarding" → member sem workspace e em primeiro acesso → cria o primeiro
//  - "accept"     → tem convite pendente (invited) → aceitar
//  - "none"       → sem workspace e sem caminho (ex.: guest sem convite que perdeu a adesão)
export type EntryTarget = "ok" | "onboarding" | "accept" | "none";

export async function resolveEntry(
  profileId: string
): Promise<{ status: "ok"; target: EntryTarget } | { status: "unavailable" }> {
  const pr = await supabaseAdmin
    .from("profiles")
    .select("account_level,first_access,last_workspace_id")
    .eq("id", profileId)
    .maybeSingle();
  if (pr.error) return { status: "unavailable" };
  const prof = pr.data as
    | { account_level: "member" | "guest"; first_access: boolean; last_workspace_id: string | null }
    | null;

  const act = await supabaseAdmin
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("status", "active");
  if (act.error) return { status: "unavailable" };
  if ((act.count ?? 0) > 0) return { status: "ok", target: "ok" };

  const inv = await supabaseAdmin
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("status", "invited");
  if (inv.error) return { status: "unavailable" };
  if ((inv.count ?? 0) > 0) return { status: "ok", target: "accept" };

  if (prof?.account_level === "member") return { status: "ok", target: "onboarding" };
  return { status: "ok", target: "none" };
}

// Caminho (URL) para um EntryTarget que precisa de redirect (onboarding/accept).
export function entryPath(target: EntryTarget): string | null {
  if (target === "onboarding") return "/onboarding";
  if (target === "accept") return "/aceitar-convite";
  return null; // ok/none não redirecionam
}
