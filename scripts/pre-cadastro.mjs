// Pré-cadastro de conta (DEC-008/REQ-020). Cria um profile; NÃO cria workspace.
//   node --env-file=.env.local scripts/pre-cadastro.mjs --email pessoa@x.com --level member|guest
// Regras: first_access = (level === 'member'); guest nunca onboarda. Falha se o e-mail já existir.
import { supabase, parseArgs } from "./_client.mjs";

const { email, level } = parseArgs(process.argv.slice(2));

if (!email || !["member", "guest"].includes(level)) {
  console.error("Uso: --email <email> --level <member|guest>");
  process.exit(1);
}

const sel = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
if (sel.error) {
  console.error("Erro de DB:", sel.error.message);
  process.exit(1);
}
if (sel.data) {
  console.error(`E-mail já cadastrado: ${email}`);
  process.exit(1);
}

const first_access = level === "member";
const ins = await supabase
  .from("profiles")
  .insert({ email, account_level: level, first_access })
  .select("id,email,account_level,first_access")
  .single();
if (ins.error) {
  console.error("Falha ao criar:", ins.error.message);
  process.exit(1);
}

console.log("Pré-cadastro OK:", ins.data);
