import { supabaseAdmin } from "@/lib/supabase";

export type AccountLevel = "member" | "guest";

export interface Profile {
  id: string;
  email: string;
  nome: string | null;
  sobrenome: string | null;
  accountLevel: AccountLevel;
  firstAccess: boolean;
  lastWorkspaceId: string | null;
}

const COLS = "id,email,nome,sobrenome,account_level,first_access,last_workspace_id";

interface Row {
  id: string;
  email: string;
  nome: string | null;
  sobrenome: string | null;
  account_level: AccountLevel;
  first_access: boolean;
  last_workspace_id: string | null;
}

function mapProfile(r: Row): Profile {
  return {
    id: r.id,
    email: r.email,
    nome: r.nome,
    sobrenome: r.sobrenome,
    accountLevel: r.account_level,
    firstAccess: r.first_access,
    lastWorkspaceId: r.last_workspace_id,
  };
}

// Portão do login (DEC-008): lê o perfil pelo email. NUNCA cria (sem auto-create).
// `missing` = e-mail não cadastrado → "fale com o administrador".
export type ProfileLookup =
  | { status: "ok"; profile: Profile }
  | { status: "missing" }
  | { status: "unavailable" };

export async function getProfileByEmail(email: string): Promise<ProfileLookup> {
  const res = await supabaseAdmin.from("profiles").select(COLS).eq("email", email).maybeSingle();
  if (res.error) return { status: "unavailable" };
  if (!res.data) return { status: "missing" };
  return { status: "ok", profile: mapProfile(res.data as Row) };
}

// Quantas adesões (em qualquer status) o perfil tem — usado no portão do guest:
// guest sem nenhuma adesão → "você precisa ser convidado para um workspace".
export type MembershipCount = { status: "ok"; count: number } | { status: "unavailable" };

export async function countMemberships(profileId: string): Promise<MembershipCount> {
  const res = await supabaseAdmin
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  if (res.error) return { status: "unavailable" };
  return { status: "ok", count: res.count ?? 0 };
}
