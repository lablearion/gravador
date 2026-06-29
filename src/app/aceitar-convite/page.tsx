import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { getCurrentProfile } from "@/lib/session";
import { resolveEntry } from "@/lib/entry";
import { listPendingInvites, acceptInvite } from "@/lib/workspaces";
import Indisponivel from "@/components/Indisponivel";
import Avatar from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function roleLabel(role: string) {
  return role === "owner" ? "Dono" : role === "admin" ? "Admin" : "Colaborador";
}

// Aceitar convite (guest ou member convidado) — DEC-008.
export default async function AceitarConvitePage() {
  const prof = await getCurrentProfile();
  if (prof.status === "unavailable") return <Indisponivel />;
  if (prof.status !== "ok") redirect("/");

  const entry = await resolveEntry(prof.data.id);
  if (entry.status === "unavailable") return <Indisponivel />;
  if (entry.target === "ok") redirect("/recordings");
  if (entry.target === "onboarding") redirect("/onboarding");

  const inv = await listPendingInvites(prof.data.id);
  if (inv.status === "unavailable") return <Indisponivel />;

  async function accept(fd: FormData) {
    "use server";
    const p = await getCurrentProfile();
    if (p.status !== "ok") redirect("/");
    const r = await acceptInvite(p.data.id, String(fd.get("workspaceId") ?? ""));
    redirect(r.status === "ok" ? "/recordings" : "/aceitar-convite?erro=1");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Mail className="size-6" />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Você foi convidado</h1>
            <p className="text-sm text-muted-foreground">Aceite para entrar no workspace.</p>
          </div>
        </div>

        {inv.invites.length === 0 ? (
          <Card>
            <CardContent
              data-testid="sem-convites"
              className="py-12 text-center text-sm text-muted-foreground"
            >
              Nenhum convite pendente.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {inv.invites.map((i) => (
              <Card key={i.workspaceId}>
                <CardContent className="flex items-center gap-3 p-4">
                  <Avatar name={i.name} email={i.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Entrar como {roleLabel(i.role)}
                    </p>
                  </div>
                  <form action={accept}>
                    <input type="hidden" name="workspaceId" value={i.workspaceId} />
                    <Button type="submit" data-testid="accept">
                      Aceitar
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
