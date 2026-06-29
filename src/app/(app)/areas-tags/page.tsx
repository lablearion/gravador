import { getActor } from "@/lib/session";
import { isModerator } from "@/lib/rbac";
import {
  listAreas,
  listTags,
  listWorkspaceMembers,
  createArea,
  renameArea,
  deleteArea,
  createTag,
  renameTag,
  deleteTag,
  setMemberArea,
} from "@/lib/taxonomy";
import { updateTag } from "next/cache";
import { recordingsTag, areasTag, tagsTag, membersTag } from "@/lib/cache-tags";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, TriangleAlert } from "lucide-react";
import Indisponivel from "@/components/Indisponivel";
import Avatar from "@/components/Avatar";
import { EditableTaxItem } from "@/components/editable-tax-item";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PATH = "/areas-tags";
const fail = (r: { status: string } & { reason?: string }) =>
  redirect(`${PATH}?erro=` + encodeURIComponent("reason" in r && r.reason ? r.reason : "indisponível"));

function roleLabel(role: string) {
  return role === "owner" ? "Dono" : role === "admin" ? "Admin" : "Colaborador";
}

export default async function AreasTagsPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const actor = await getActor();
  if (actor.status === "unavailable") return <Indisponivel />;
  if (actor.status !== "ok") redirect("/recordings");
  if (!isModerator(actor.data)) {
    return (
      <main className="p-8 text-sm">
        Só owner/admin gerenciam Áreas &amp; Tags.{" "}
        <Link href="/recordings" className="text-primary underline">
          Voltar
        </Link>
      </main>
    );
  }

  const [areasRes, tagsRes, membersRes] = await Promise.all([
    listAreas(actor.data.workspaceId),
    listTags(actor.data.workspaceId),
    listWorkspaceMembers(actor.data.workspaceId),
  ]);
  if (areasRes.status === "unavailable" || tagsRes.status === "unavailable" || membersRes.status === "unavailable")
    return <Indisponivel />;

  // ---- Server Actions (re-checam ator + política no lib) -------------------
  // Invalidação por TAG (DEC-018/DEV-030). Atenção às denormalizações: o nome da área aparece na
  // LISTA (recordings) e nos MEMBROS; o nome/vínculo de tag aparece na lista. Por isso renomear/
  // deletar uma área toca recordings+members; renomear/deletar tag toca recordings.
  async function novaArea(fd: FormData) {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const r = await createArea(a.data, String(fd.get("name") ?? ""));
    if (r.status === "ok") {
      const ws = a.data.workspaceId;
      updateTag(areasTag(ws)); // área nova
      updateTag(tagsTag(ws)); // + tag homônima (DEC-014)
    } else fail(r);
  }
  async function renomearArea(fd: FormData) {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const r = await renameArea(a.data, String(fd.get("areaId") ?? ""), String(fd.get("name") ?? ""));
    if (r.status === "ok") {
      const ws = a.data.workspaceId;
      updateTag(areasTag(ws));
      updateTag(recordingsTag(ws)); // nome da área é denormalizado na lista
      updateTag(membersTag(ws)); // e nos membros
    } else fail(r);
  }
  async function removerArea(fd: FormData) {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const r = await deleteArea(a.data, String(fd.get("areaId") ?? ""));
    if (r.status === "ok") {
      const ws = a.data.workspaceId;
      // deleteArea reatribui gravações E membros para "Todas" antes de deletar → invalida os três.
      updateTag(areasTag(ws));
      updateTag(recordingsTag(ws));
      updateTag(membersTag(ws));
    } else fail(r);
  }
  async function novaTag(fd: FormData) {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const r = await createTag(a.data, String(fd.get("name") ?? ""));
    if (r.status === "ok") updateTag(tagsTag(a.data.workspaceId));
    else fail(r);
  }
  async function renomearTag(fd: FormData) {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const r = await renameTag(a.data, String(fd.get("tagId") ?? ""), String(fd.get("name") ?? ""));
    if (r.status === "ok") {
      const ws = a.data.workspaceId;
      updateTag(tagsTag(ws));
      updateTag(recordingsTag(ws)); // nome da tag é denormalizado na lista
    } else fail(r);
  }
  async function removerTag(fd: FormData) {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const r = await deleteTag(a.data, String(fd.get("tagId") ?? ""));
    if (r.status === "ok") {
      const ws = a.data.workspaceId;
      updateTag(tagsTag(ws));
      updateTag(recordingsTag(ws)); // vínculo da tag some das gravações
    } else fail(r);
  }
  async function moverMembro(fd: FormData) {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const r = await setMemberArea(a.data, String(fd.get("profileId") ?? ""), String(fd.get("areaId") ?? ""));
    if (r.status === "ok") updateTag(membersTag(a.data.workspaceId));
    else fail(r);
  }

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <AutoRefresh intervalMs={60000} />
        <h1 className="text-xl font-semibold tracking-tight lg:hidden">Áreas &amp; Tags</h1>

        {erro && (
          <div
            data-testid="erro"
            className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{erro}</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ÁREAS */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Áreas</CardTitle>
              <CardDescription>Criar área cria uma tag de mesmo nome (DEC-014).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2" data-testid="areas">
                {areasRes.areas.map((a) => (
                  <li
                    key={a.id}
                    data-testid="area-item"
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    {a.isDefault ? (
                      <span className="flex items-center gap-2">
                        {a.name} <Badge variant="secondary">padrão</Badge>
                      </span>
                    ) : (
                      <EditableTaxItem
                        renameAction={renomearArea}
                        deleteAction={removerArea}
                        idName="areaId"
                        idValue={a.id}
                        value={a.name}
                        layout="spread"
                        deleteVariant="trash"
                        confirmTitle="Deletar área?"
                        confirmDescription={`As gravações e os membros em “${a.name}” voltam para “Todas”. A tag de mesmo nome não é afetada.`}
                        inputTestid="area-nome"
                        renameTestid="area-renomear"
                        deleteTestid="area-deletar"
                      />
                    )}
                  </li>
                ))}
              </ul>
              <form action={novaArea} className="flex gap-2">
                <Input name="name" placeholder="Nova área" required data-testid="nova-area-nome" className="h-9" />
                <Button type="submit" size="sm" data-testid="nova-area">
                  <Plus data-icon="inline-start" /> Área
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* TAGS */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tags</CardTitle>
              <CardDescription>As do sistema são protegidas; as suas podem ser editadas.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="flex flex-wrap gap-2" data-testid="tags">
                {tagsRes.tags.map((t) => (
                  <li
                    key={t.id}
                    data-testid="tag-item"
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-sm"
                  >
                    {t.source === "system" ? (
                      <span className="flex items-center gap-1">
                        {t.name}
                        <span className="text-xs text-muted-foreground">sistema</span>
                      </span>
                    ) : (
                      <EditableTaxItem
                        renameAction={renomearTag}
                        deleteAction={removerTag}
                        idName="tagId"
                        idValue={t.id}
                        value={t.name}
                        layout="inline"
                        deleteVariant="x"
                        confirmTitle="Deletar tag?"
                        confirmDescription={`A tag “${t.name}” é removida de todas as gravações que a usavam. As gravações em si não são afetadas.`}
                        inputTestid="tag-nome"
                        renameTestid="tag-renomear"
                        deleteTestid="tag-deletar"
                        badge={t.source === "ai" ? <span className="text-xs text-muted-foreground">IA</span> : undefined}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <form action={novaTag} className="flex gap-2">
                <Input name="name" placeholder="Nova tag" required data-testid="nova-tag-nome" className="h-9" />
                <Button type="submit" size="sm" data-testid="nova-tag">
                  <Plus data-icon="inline-start" /> Tag
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* MEMBROS (mover área) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Membros — área</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2" data-testid="membros">
              {membersRes.members.map((m) => (
                <li
                  key={m.profileId}
                  data-testid="membro-item"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={m.nome ?? m.email} email={m.email} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.nome ?? m.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {roleLabel(m.role)} · {m.areaName ?? "?"}
                      </p>
                    </div>
                  </div>
                  <form action={moverMembro} className="flex items-center gap-2">
                    <input type="hidden" name="profileId" value={m.profileId} />
                    {/* key força remontar o <select> quando a área muda após revalidatePath (APR-008). */}
                    <select
                      key={m.areaId ?? "none"}
                      name="areaId"
                      defaultValue={m.areaId ?? ""}
                      data-testid="membro-area"
                      className="h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      {areasRes.areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" variant="outline" data-testid="membro-mover">
                      Mover
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
