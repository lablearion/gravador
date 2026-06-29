"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Lock, Globe, SlidersHorizontal, X } from "lucide-react";
import { statusLabel } from "@/lib/recording-status";
import { Skeleton } from "@/components/ui/skeleton";
import { AutoRefresh } from "@/components/auto-refresh";
import { cn } from "@/lib/utils";

// DTO mínimo que a ilha precisa para renderizar o card. A LISTA já vem RBAC-filtrada do servidor
// (o client só vê o que pode ver); a data já vem formatada (evita mismatch de hidratação por timezone).
export interface RecordingItem {
  id: string;
  authorId: string;
  titulo: string | null;
  resumo: string | null;
  status: string;
  visibilidade: "public" | "private";
  deleted: boolean;
  dateLabel: string;
  areaName: string | null;
  authorNome: string | null;
  tags: { id: string; name: string }[];
}

// Tom do badge de status (ponto + texto), por status. Cores = tokens do Claude Design.
const STATUS_STYLE: Record<string, { text: string; bg: string; dot: string }> = {
  done: { text: "text-success", bg: "bg-success/15", dot: "bg-success" },
  processing: { text: "text-warning", bg: "bg-warning/15", dot: "bg-warning" },
  awaiting_processing: { text: "text-muted-foreground", bg: "bg-muted", dot: "bg-muted-foreground" },
  error: { text: "text-destructive", bg: "bg-destructive/15", dot: "bg-destructive" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.awaiting_processing;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        s.bg,
        s.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {statusLabel(status)}
    </span>
  );
}

// Card de uma gravação. Altura UNIFORME via espaços RESERVADOS: resumo e tags têm min-height fixo
// (com placeholder/skeleton enquanto não-processado), para um card não inflar o vizinho (DEC-018/design 1.1).
function RecordingCard({ r, meuId, moderador }: { r: RecordingItem; meuId: string; moderador: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const ready = r.status === "done";
  const pending = r.status === "awaiting_processing" || r.status === "processing";
  const verVisibilidade = moderador || r.authorId === meuId;
  const resumoLong = (r.resumo?.length ?? 0) > 90;

  return (
    <Link
      href={`/recordings/${r.id}`}
      data-testid="item"
      className={cn(
        "flex h-full flex-col gap-2.5 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-[var(--shadow-md)]",
        r.deleted && "opacity-60",
      )}
    >
      {/* Título (até 2 linhas) + status */}
      <div className="flex items-start justify-between gap-2">
        <h3
          className="line-clamp-2 min-h-[2.75em] font-semibold leading-snug"
          title={r.titulo ?? r.dateLabel}
        >
          {r.titulo ?? r.dateLabel}
        </h3>
        <StatusBadge status={r.status} />
      </div>

      {/* Resumo (espaço reservado p/ 2 linhas + "mostrar mais") */}
      <div className="min-h-[3.75rem]">
        {ready && r.resumo ? (
          <div>
            <p
              className={cn("text-sm text-muted-foreground", !expanded && "line-clamp-2")}
              data-testid="resumo"
            >
              {r.resumo}
            </p>
            {resumoLong && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                className="mt-0.5 text-xs font-medium text-primary hover:underline"
              >
                {expanded ? "mostrar menos" : "mostrar mais"}
              </button>
            )}
          </div>
        ) : pending ? (
          <div className="space-y-1.5 pt-0.5" aria-hidden>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : null}
      </div>

      {/* Tags (1 linha; scroll horizontal; placeholder cinza enquanto pendente) */}
      <div className="min-h-[1.5rem]">
        {ready ? (
          r.tags.length > 0 && (
            <div
              data-testid="item-tags"
              className="flex gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {r.tags.map((t) => (
                <span
                  key={t.id}
                  className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                >
                  {t.name}
                </span>
              ))}
            </div>
          )
        ) : pending ? (
          <div className="flex">
            <span className="h-5 w-16 animate-pulse rounded-full bg-muted" aria-hidden />
          </div>
        ) : null}
      </div>

      {/* Meta */}
      <div className="mt-auto flex items-center gap-x-2 text-xs text-muted-foreground">
        {verVisibilidade && (
          <span className="inline-flex shrink-0 items-center gap-1">
            {r.visibilidade === "private" ? (
              <>
                <Lock className="size-3" /> Privada
              </>
            ) : (
              <>
                <Globe className="size-3" /> Pública
              </>
            )}
          </span>
        )}
        {r.areaName && <span className="shrink-0">· {r.areaName}</span>}
        <span className="truncate" title={r.authorNome ?? undefined}>
          · {r.authorNome ?? "?"}
        </span>
        <span className="ml-auto shrink-0">{r.dateLabel}</span>
      </div>
    </Link>
  );
}

// Lista de gravações + toggle Todas|Minhas + busca/filtros. O toggle é estado CLIENT (filtra os dados
// já carregados, sem refetch/URL — DEC-018). O RBAC fica no servidor (a lista recebida já vem filtrada).
// searchField/filterPanel são JSX server (campos do form GET id="rec-filtros") — renderizados aqui;
// no mobile o painel vira bottom-sheet (uma instância só → não duplica os inputs do form).
export function RecordingsList({
  items,
  meuId,
  moderador,
  filtersActive,
  searchField,
  filterPanel,
}: {
  items: RecordingItem[];
  meuId: string;
  moderador: boolean;
  filtersActive: boolean;
  searchField: ReactNode;
  filterPanel: ReactNode;
}) {
  const [mine, setMine] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const shown = mine ? items.filter((r) => r.authorId === meuId) : items;
  // Só as PRÓPRIAS gravações aparecem como aguardando/processando (RBAC: outros só veem 'done') →
  // ter pendente = esperar o back-p processar a SUA gravação → poll rápido (10s); senão, base (30s).
  const hasPending = items.some(
    (r) => r.status === "awaiting_processing" || r.status === "processing",
  );

  return (
    <>
      <AutoRefresh intervalMs={30000} fastIntervalMs={10000} fast={hasPending} />
      {/* Linha superior: segmented + busca (+ botão de filtros no mobile) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          className="flex w-full shrink-0 rounded-lg border border-border bg-muted p-1 text-sm sm:w-fit"
          data-testid="escopo"
        >
          <button
            type="button"
            onClick={() => setMine(false)}
            data-testid="escopo-todas"
            aria-pressed={!mine}
            className={cn(
              "flex-1 rounded-md px-4 py-1.5 font-medium transition-colors sm:flex-none",
              !mine ? "bg-card text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground",
            )}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setMine(true)}
            data-testid="escopo-minhas"
            aria-pressed={mine}
            className={cn(
              "flex-1 rounded-md px-4 py-1.5 font-medium transition-colors sm:flex-none",
              mine ? "bg-card text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground",
            )}
          >
            Minhas
          </button>
        </div>

        <div className="flex items-center gap-2 sm:flex-1">
          <div className="flex-1">{searchField}</div>
          {/* Botão de filtros (abre o bottom-sheet) — só mobile/tablet */}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            data-testid="abrir-filtros"
            aria-label="Filtros"
            className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent/40 lg:hidden"
          >
            <SlidersHorizontal className="size-4" />
            {filtersActive && (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Lista */}
        <div className="min-w-0 flex-1">
          {shown.length === 0 ? (
            <div
              data-testid="vazio"
              className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground"
            >
              {mine ? "Você ainda não tem gravações aqui." : "Nenhuma gravação encontrada."}
            </div>
          ) : (
            <ul
              className="grid grid-cols-1 items-start gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]"
              data-testid="lista"
            >
              {shown.map((r) => (
                <li key={r.id}>
                  <RecordingCard r={r} meuId={meuId} moderador={moderador} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Filtros: aside no desktop / bottom-sheet no mobile (UMA instância — não duplica inputs) */}
        {filtersOpen && (
          <div
            className="fixed inset-0 z-40 bg-foreground/30 lg:hidden"
            onClick={() => setFiltersOpen(false)}
            aria-hidden
          />
        )}
        <aside
          className={cn(
            // mobile: bottom-sheet
            "fixed inset-x-0 bottom-0 z-50 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 shadow-[var(--shadow-lg)] transition-transform duration-300",
            filtersOpen ? "translate-y-0" : "translate-y-full",
            // desktop: aside estático (zera o estilo de sheet)
            "lg:static lg:z-auto lg:max-h-none lg:w-72 lg:shrink-0 lg:translate-y-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
          )}
        >
          {/* No mobile o cabeçalho "Filtros" vem do próprio painel; aqui só o botão de fechar. */}
          <div className="mb-1 flex justify-end lg:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              aria-label="Fechar filtros"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent/40"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="lg:sticky lg:top-6 lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-4">
            {filterPanel}
          </div>
        </aside>
      </div>
    </>
  );
}
