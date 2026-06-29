import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { getProfileByEmail, countMemberships } from "@/lib/profiles";
import { BackendUnavailableError } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadAvatar } from "@/lib/drive";

// Dev login: SÓ fora de produção. Loga por e-mail (sem OAuth) para testes automatizados.
const devProviders =
  process.env.NODE_ENV !== "production"
    ? [
        Credentials({
          id: "dev",
          name: "Dev",
          credentials: { email: {} },
          authorize: (c) => {
            const email = (c?.email as string) || "";
            return email ? { id: email, email } : null;
          },
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [Google, ...devProviders],
  // Erros de login (incl. backend indisponível) voltam pra home, que mostra um aviso. Ver DEC-012.
  pages: { error: "/" },
  callbacks: {
    // PORTÃO de acesso fechado (DEC-008). Sem auto-create. Três saídas:
    //  - e-mail não cadastrado            → /?gate=not_registered ("fale com o administrador")
    //  - guest sem nenhuma adesão         → /?gate=needs_invite   ("você precisa ser convidado")
    //  - cadastrado e com onde entrar     → segue
    // Backend fora durante o login → bloqueia (BackendUnavailableError → banner na home).
    async signIn({ user }) {
      const email = user?.email;
      if (!email) return false;
      const look = await getProfileByEmail(email);
      if (look.status === "unavailable") throw new BackendUnavailableError("login");
      if (look.status === "missing") return "/?gate=not_registered";
      if (look.profile.accountLevel === "guest") {
        const m = await countMemberships(look.profile.id);
        if (m.status === "unavailable") throw new BackendUnavailableError("login");
        if (m.count === 0) return "/?gate=needs_invite";
      }
      return true;
    },
    // O token carrega só a IDENTIDADE (profileId). Papel/área vêm frescos do DB por requisição
    // (DEC-011), resolvidos pelo workspace ativo em session.getActor — nunca do token.
    async jwt({ token, user }) {
      if (user?.email) {
        const look = await getProfileByEmail(user.email);
        // signIn já garantiu que existe; se aqui falhar, é backend fora → bloqueia.
        if (look.status !== "ok") throw new BackendUnavailableError("login");
        token.profileId = look.profile.id;
        // Popular nome/sobrenome a partir do Google no 1º login (o pré-cadastro só guarda o e-mail).
        // Sem isso, a pasta do usuário no Drive (DEC-009) cai no e-mail. dev-login não traz nome → segue null.
        if (user.name && !look.profile.nome) {
          const parts = user.name.trim().split(/\s+/);
          await supabaseAdmin
            .from("profiles")
            .update({ nome: parts[0], sobrenome: parts.slice(1).join(" ") || null })
            .eq("id", look.profile.id)
            .is("nome", null);
        }
        // Avatar do Google → Drive (Avatares), só no 1º login (guard avatar_drive_id is null).
        // BEST-EFFORT: qualquer falha aqui NÃO bloqueia o login — sem avatar, a UI usa o fallback
        // de inicial+cor. dev-login não traz `image` → segue sem avatar (esperado). (REQ-032 / DEV-019)
        if (user.image) {
          try {
            const cur = await supabaseAdmin
              .from("profiles")
              .select("avatar_drive_id")
              .eq("id", look.profile.id)
              .maybeSingle();
            if (!cur.error && cur.data && !cur.data.avatar_drive_id) {
              const img = await fetch(user.image);
              if (img.ok) {
                const data = new Uint8Array(await img.arrayBuffer());
                const ct = img.headers.get("content-type") || "image/jpeg";
                const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
                const label = look.profile.nome ?? user.name ?? look.profile.email;
                const fileId = await uploadAvatar({
                  profileId: look.profile.id,
                  label,
                  ext,
                  mimeType: ct,
                  data,
                });
                await supabaseAdmin
                  .from("profiles")
                  .update({ avatar_drive_id: fileId })
                  .eq("id", look.profile.id)
                  .is("avatar_drive_id", null);
              }
            }
          } catch {
            // best-effort: avatar fica nulo → fallback de inicial.
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.profileId as string;
      return session;
    },
  },
});
