// Cliente Supabase (service_role) para os scripts de cadastro (DB direto, sem front).
// Uso: node --env-file=.env.local scripts/<script>.mjs ...
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Rode com: node --env-file=.env.local scripts/<script>.mjs"
  );
  process.exit(1);
}

export const supabase = createClient(url, key, { auth: { persistSession: false } });

// Parser simples de --chave valor.
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    }
  }
  return out;
}
