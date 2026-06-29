import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Mic, TriangleAlert } from "lucide-react";
import { signIn, signOut } from "@/auth";
import { getCurrentProfile } from "@/lib/session";
import { resolveEntry, entryPath } from "@/lib/entry";
import { landingPath } from "@/lib/device";
import Indisponivel from "@/components/Indisponivel";
import { Button } from "@/components/ui/button";

// Mensagens do portão de acesso fechado (DEC-008). Vêm via ?gate= no redirect do signIn.
const GATE_MSG: Record<string, string> = {
  not_registered: "Seu e-mail não está cadastrado. Fale com o administrador.",
  needs_invite: "Você precisa ser convidado para um workspace.",
};

function Logo({ size = 72 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.34_0.16_288)] text-primary-foreground shadow-[var(--shadow-primary)]"
      style={{ width: size, height: size }}
    >
      <Mic style={{ width: size * 0.42, height: size * 0.42 }} />
    </span>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; gate?: string }>;
}) {
  const { error, gate } = await searchParams;
  const prof = await getCurrentProfile();

  // DB fora para um usuário com sessão válida (o caso "logado mas sem dados"). DEC-012.
  if (prof.status === "unavailable") return <Indisponivel />;

  // Logado: "/" é o ponto de entrada (start_url da PWA). Decide a tela inicial e redireciona —
  // com workspace ativo, landing POR DEVICE (mobile→Gravar, desktop→Gravações, DEC-017); sem
  // workspace, roteia para onboarding/aceitar-convite (DEC-008). Reabrir o app (fechado) sempre
  // passa por aqui, então cai na tela certa.
  if (prof.status === "ok") {
    if (prof.data.lastWorkspaceId) {
      const ua = (await headers()).get("user-agent");
      redirect(landingPath(ua));
    }
    const e = await resolveEntry(prof.data.id);
    if (e.status === "unavailable") return <Indisponivel />;
    const path = entryPath(e.target);
    redirect(path ?? "/workspace");
  }

  // Ramo no-profile: sessão válida sem perfil → sair.
  if (prof.status === "no-profile") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
        <Logo />
        <div className="max-w-sm space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Sessão sem perfil</h1>
          <p className="text-sm text-muted-foreground">
            Sua sessão está ativa, mas o perfil não foi encontrado. Saia e entre novamente.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <Button type="submit" variant="outline">
            Sair
          </Button>
        </form>
      </main>
    );
  }

  // Ramo DESLOGADO: portão (gate) e/ou erro de backend. Login OK nunca cai aqui.
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Painel de marca (desktop) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-[oklch(0.34_0.16_288)] p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <Logo size={40} />
          <span className="text-lg font-semibold tracking-tight">Gravador</span>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Capture, transcreva
            <br />e organize.
          </h1>
          <p className="mt-4 max-w-sm text-primary-foreground/75">
            Grave conversas e reuniões. O sistema transcreve, resume e organiza por workspace —
            nada se perde.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">App privado · acesso por convite</p>
      </div>

      {/* Card de login */}
      <div className="flex items-center justify-center p-6">
        <div className="flex w-full max-w-[420px] flex-col gap-7">
          <div className="flex flex-col items-center gap-4 text-center lg:items-start lg:text-left">
            <span className="lg:hidden">
              <Logo />
            </span>
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
              <p className="text-sm text-muted-foreground">Use sua conta Google.</p>
            </div>
          </div>

          {gate && GATE_MSG[gate] && (
            <div
              data-testid="gate-msg"
              className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-foreground"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>{GATE_MSG[gate]}</span>
            </div>
          )}
          {error && (
            <div
              data-testid="login-erro"
              className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-foreground"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>Não foi possível entrar agora. Tente novamente em alguns minutos.</span>
            </div>
          )}

          <form
            action={async () => {
              "use server";
              await signIn("google");
            }}
          >
            <button
              type="submit"
              className="flex h-[52px] w-full items-center justify-center gap-3 rounded-[13px] border border-border bg-card text-sm font-medium shadow-[var(--shadow-sm)] transition-colors hover:bg-accent/40"
            >
              <GoogleIcon /> Entrar com Google
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground lg:text-left">
            Ao entrar, você concorda em usar o app conforme as políticas do seu workspace.
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
