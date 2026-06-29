import { redirect } from "next/navigation";
import { TriangleAlert, Plus } from "lucide-react";
import { getCurrentProfile } from "@/lib/session";
import { listMyWorkspaces, setActiveWorkspace, createWorkspace } from "@/lib/workspaces";
import Indisponivel from "@/components/Indisponivel";
import Avatar from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AutoRefresh } from "@/components/auto-refresh";

function roleLabel(role: string) {
  return role === "owner" ? "Dono" : role === "admin" ? "Admin" : "Colaborador";
}

// Trocar workspace ativo + criar novo (member) — DEC-013.
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const prof = await getCurrentProfile();
  if (prof.status === "unavailable") return <Indisponivel />;
  if (prof.status !== "ok") redirect("/");

  const list = await listMyWorkspaces(prof.data.id);
  if (list.status === "unavailable") return <Indisponivel />;
  const activeId = prof.data.lastWorkspaceId;
  const isMember = prof.data.accountLevel === "member";

  async function switchWs(fd: FormData) {
    "use server";
    const p = await getCurrentProfile();
    if (p.status !== "ok") redirect("/");
    await setActiveWorkspace(p.data.id, String(fd.get("workspaceId") ?? ""));
    redirect("/recordings");
  }

  async function create(fd: FormData) {
    "use server";
    const p = await getCurrentProfile();
    if (p.status !== "ok") redirect("/");
    if (p.data.accountLevel !== "member") redirect("/workspace?erro=" + encodeURIComponent("guest não cria workspace"));
    const r = await createWorkspace(p.data.id, { name: String(fd.get("name") ?? "") });
    if (r.status === "ok") redirect("/recordings");
    redirect("/workspace?erro=" + encodeURIComponent(r.status === "invalid" ? r.reason : "indisponível"));
  }

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <AutoRefresh intervalMs={60000} />
        <h1 className="text-xl font-semibold tracking-tight lg:hidden">Workspace</h1>

        {erro && (
          <div
            data-testid="erro"
            className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{erro}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seus workspaces</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2" data-testid="meus-workspaces">
              {list.workspaces.length === 0 && (
                <li className="text-sm text-muted-foreground">Nenhum workspace ativo.</li>
              )}
              {list.workspaces.map((w) => {
                const ativo = w.workspaceId === activeId;
                return (
                  <li
                    key={w.workspaceId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={w.name} email={w.name} size={36} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{w.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{roleLabel(w.role)}</p>
                      </div>
                    </div>
                    {ativo ? (
                      <Badge variant="secondary">Ativo</Badge>
                    ) : (
                      <form action={switchWs}>
                        <input type="hidden" name="workspaceId" value={w.workspaceId} />
                        <Button type="submit" size="sm" variant="outline" data-testid="switch">
                          Tornar ativo
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {isMember && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Criar novo workspace</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={create} className="flex gap-2">
                <Input name="name" required placeholder="Nome do workspace" data-testid="novo-ws-name" />
                <Button type="submit" data-testid="criar-ws">
                  <Plus data-icon="inline-start" /> Criar
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
