import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { getActor, getCurrentProfile } from "@/lib/session";
import { listRecordingsForActor, type RecordingFilters } from "@/lib/recordings";
import { listAreas, listTags } from "@/lib/taxonomy";
import { resolveEntry, entryPath } from "@/lib/entry";
import { isModerator } from "@/lib/rbac";
import Indisponivel from "@/components/Indisponivel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RecordingsList, type RecordingItem } from "./recordings-list";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function asArray(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// `mine` saiu da URL: o toggle Minhas|Todas é estado client (filtra os dados já carregados).
type SP = { q?: string; area?: string; tags?: string | string[]; deleted?: string };

// ID do form GET vazio; busca/área/tags/deletadas referenciam por `form="rec-filtros"` (HTML form
// attribute) → os campos podem ficar em lugares diferentes (busca na barra superior, chips no painel)
// e mesmo assim submetem juntos, sem JS, sem duplicar inputs. Ver recordings-list (painel = 1 instância).
const FORM_ID = "rec-filtros";

// Chip de filtro (rádio = área, single; checkbox = tags, multi). Estilo do Claude Design (1.1):
// h-8, radius 9px, selecionado = preenchido com primary. peer-checked estiliza sem JS.
function FilterChip({
  type,
  name,
  value,
  label,
  defaultChecked,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        form={FORM_ID}
        className="peer sr-only"
      />
      <span className="inline-flex h-8 items-center rounded-[9px] border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent/40 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
        {label}
      </span>
    </label>
  );
}

export default async function RecordingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await getActor();

  if (actor.status === "unauthenticated") {
    return (
      <main className="p-8">
        <Link href="/" className="text-primary underline">
          Entrar
        </Link>
      </main>
    );
  }
  if (actor.status === "unavailable") return <Indisponivel />;
  if (actor.status === "no-profile") {
    return (
      <main className="p-8">
        Perfil não encontrado.{" "}
        <Link href="/" className="text-primary underline">
          Voltar
        </Link>
      </main>
    );
  }
  if (actor.status === "no-workspace") {
    const prof = await getCurrentProfile();
    if (prof.status === "ok") {
      const e = await resolveEntry(prof.data.id);
      if (e.status === "ok") {
        const path = entryPath(e.target);
        if (path) redirect(path);
      }
    }
    return (
      <main className="p-8">
        Você ainda não tem um workspace ativo.{" "}
        <Link href="/workspace" className="text-primary underline">
          Workspaces
        </Link>
      </main>
    );
  }

  const moderador = isModerator(actor.data);
  const meuId = actor.data.profileId;
  const includeDeleted = moderador && sp.deleted === "1";
  const selectedTags = asArray(sp.tags);

  // `onlyMine` NÃO entra aqui — o toggle é client. O servidor traz tudo que o ator pode ver.
  const filters: RecordingFilters = {
    search: sp.q,
    areaId: sp.area || undefined,
    tagIds: selectedTags.length ? selectedTags : undefined,
    includeDeleted,
  };

  const [list, areasRes, tagsRes] = await Promise.all([
    listRecordingsForActor(actor.data, filters),
    listAreas(actor.data.workspaceId),
    listTags(actor.data.workspaceId),
  ]);
  if (list.status === "unavailable" || areasRes.status === "unavailable" || tagsRes.status === "unavailable")
    return <Indisponivel />;
  const areaOptions = areasRes.areas.filter((a) => !a.isDefault);
  const filtersActive = Boolean(sp.q || sp.area || selectedTags.length || includeDeleted);

  // DTO seguro para a ilha client (lista já RBAC-filtrada; data formatada no servidor).
  const items: RecordingItem[] = list.data.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    titulo: r.titulo,
    resumo: r.resumo,
    status: r.status,
    visibilidade: r.visibilidade,
    deleted: r.deleted,
    dateLabel: fmtDate(r.createdAt),
    areaName: r.areaName,
    authorNome: r.authorNome,
    tags: r.tags,
  }));

  // Busca (barra superior) — campo do form GET.
  const searchField = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        form={FORM_ID}
        name="q"
        defaultValue={sp.q ?? ""}
        placeholder="Buscar gravações"
        data-testid="f-busca"
        className="h-10 pl-9"
      />
    </div>
  );

  // Painel de filtros (aside no desktop / bottom-sheet no mobile — renderizado 1x pela ilha).
  const filterPanel = (
    <div data-testid="filtros" className="flex flex-col gap-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Filtros</span>
        <Link
          href="/recordings"
          data-testid="f-limpar"
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Limpar
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Área</span>
        <div className="flex flex-wrap gap-1.5" data-testid="f-area">
          <FilterChip type="radio" name="area" value="" label="Todas" defaultChecked={!sp.area} />
          {areaOptions.map((a) => (
            <FilterChip key={a.id} type="radio" name="area" value={a.id} label={a.name} defaultChecked={sp.area === a.id} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Tags</span>
        <div className="flex flex-wrap gap-1.5" data-testid="f-tags">
          {tagsRes.tags.map((t) => (
            <FilterChip
              key={t.id}
              type="checkbox"
              name="tags"
              value={t.id}
              label={t.name}
              defaultChecked={selectedTags.includes(t.id)}
            />
          ))}
        </div>
      </div>

      {moderador && (
        <label className="flex items-center gap-2" data-testid="toggle-deletadas">
          <input
            type="checkbox"
            name="deleted"
            value="1"
            defaultChecked={includeDeleted}
            form={FORM_ID}
            className="size-4 accent-primary"
          />
          Incluir deletadas
        </label>
      )}

      <Button form={FORM_ID} type="submit" size="sm" data-testid="f-aplicar" className="w-full lg:w-auto">
        Filtrar
      </Button>
    </div>
  );

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight lg:hidden">Gravações</h1>
        {/* Form GET vazio; os campos referenciam por form="rec-filtros". */}
        <form id={FORM_ID} method="get" className="hidden" />
        <RecordingsList
          items={items}
          meuId={meuId}
          moderador={moderador}
          filtersActive={filtersActive}
          searchField={searchField}
          filterPanel={filterPanel}
        />
      </div>
    </main>
  );
}
