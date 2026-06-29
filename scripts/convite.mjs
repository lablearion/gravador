// Convite de um perfil para um workspace (DEC-008/REQ-020). Cria adesão status='invited'.
//   node --env-file=.env.local scripts/convite.mjs --email pessoa@x.com --role admin|collaborator --workspace <id|nome>
// Regras: e-mail precisa existir; role ≠ owner; workspace precisa existir. Novo membro entra na área "Todas".
import { supabase, parseArgs } from "./_client.mjs";

const { email, role, workspace } = parseArgs(process.argv.slice(2));

if (!email || !["admin", "collaborator"].includes(role) || !workspace) {
  console.error("Uso: --email <email> --role <admin|collaborator> --workspace <id|nome>");
  process.exit(1);
}

const prof = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
if (prof.error) {
  console.error("Erro de DB:", prof.error.message);
  process.exit(1);
}
if (!prof.data) {
  console.error(`E-mail não cadastrado (rode o pré-cadastro antes): ${email}`);
  process.exit(1);
}

const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspace);
const wsQ = supabase.from("workspaces").select("id,name");
const ws = await (isUuid ? wsQ.eq("id", workspace) : wsQ.eq("name", workspace)).maybeSingle();
if (ws.error) {
  console.error("Erro de DB:", ws.error.message);
  process.exit(1);
}
if (!ws.data) {
  console.error(`Workspace não encontrado: ${workspace}`);
  process.exit(1);
}

const area = await supabase
  .from("areas")
  .select("id")
  .eq("workspace_id", ws.data.id)
  .eq("is_default", true)
  .maybeSingle();

const ins = await supabase
  .from("workspace_members")
  .insert({
    workspace_id: ws.data.id,
    profile_id: prof.data.id,
    workspace_role: role,
    status: "invited",
    area_id: area.data?.id ?? null,
  })
  .select("id,workspace_role,status")
  .single();
if (ins.error) {
  console.error("Falha ao convidar (já é membro?):", ins.error.message);
  process.exit(1);
}

console.log("Convite OK:", { email, workspace: ws.data.name, ...ins.data });
