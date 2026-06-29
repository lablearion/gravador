import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { getCurrentProfile } from "@/lib/session";
import { resolveEntry } from "@/lib/entry";
import { createWorkspace, SYSTEM_TAGS } from "@/lib/workspaces";
import Indisponivel from "@/components/Indisponivel";
import { ChipsInput } from "@/components/chips-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Onboarding do MEMBER (DEC-008): cria o primeiro workspace.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const prof = await getCurrentProfile();
  if (prof.status === "unavailable") return <Indisponivel />;
  if (prof.status !== "ok") redirect("/");

  // Guarda: só quem precisa onboardar fica aqui; o resto vai pro lugar certo.
  const entry = await resolveEntry(prof.data.id);
  if (entry.status === "unavailable") return <Indisponivel />;
  if (entry.target === "ok") redirect("/recordings");
  if (entry.target === "accept") redirect("/aceitar-convite");
  if (entry.target === "none") redirect("/");

  async function onboard(fd: FormData) {
    "use server";
    const p = await getCurrentProfile();
    if (p.status !== "ok") redirect("/");
    const name = String(fd.get("name") ?? "");
    const extraTags = String(fd.get("tags") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const extraAreas = String(fd.get("areas") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const r = await createWorkspace(p.data.id, { name, extraTags, extraAreas });
    if (r.status === "ok") redirect("/recordings");
    redirect("/onboarding?erro=" + encodeURIComponent(r.status === "invalid" ? r.reason : "indisponível"));
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Primeiro acesso</p>
          <CardTitle className="text-2xl tracking-tight">Crie seu workspace</CardTitle>
          <CardDescription>
            Dê um nome, defina as áreas e veja as tags do sistema. Dá para ajustar tudo depois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {erro && (
            <div
              data-testid="erro"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{erro}</span>
            </div>
          )}
          <form action={onboard} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ws-name">Nome do workspace</Label>
              <Input id="ws-name" name="name" required data-testid="ws-name" placeholder="Ex.: Clínica Aurora" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>
                Áreas{" "}
                <span className="font-normal text-muted-foreground">· criar área cria uma tag homônima</span>
              </Label>
              <ChipsInput name="areas" placeholder="Adicionar área" staticChips={["Todas"]} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>
                Tags <span className="font-normal text-muted-foreground">· as do sistema já vêm; adicione as suas</span>
              </Label>
              <ChipsInput name="tags" placeholder="Adicionar tag" staticChips={[...SYSTEM_TAGS]} />
            </div>

            <Button type="submit" data-testid="onboard-submit" className="w-full">
              Criar workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
