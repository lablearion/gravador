import Link from "next/link";
import { updateTag } from "next/cache";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Lock, Globe, TriangleAlert } from "lucide-react";
import { getActor } from "@/lib/session";
import {
  getRecordingForActor,
  getRecordingOutputs,
  softDeleteRecording,
  setVisibility,
  setRecordingArea,
  statusLabel,
} from "@/lib/recordings";
import { listAreas } from "@/lib/taxonomy";
import { recordingsTag } from "@/lib/cache-tags";
import { AutoRefresh } from "@/components/auto-refresh";
import { canDelete, canToggleVisibility, isModerator } from "@/lib/rbac";
import Indisponivel from "@/components/Indisponivel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RecordingOutputs, DeleteRecordingButton } from "./detail-client";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const STATUS_STYLE: Record<string, string> = {
  done: "bg-success/15 text-success",
  processing: "bg-warning/20 text-warning",
  awaiting_processing: "bg-muted text-muted-foreground",
  error: "bg-destructive/15 text-destructive",
};

export default async function RecordingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { id } = await params;
  const { erro } = await searchParams;

  const actor = await getActor();
  if (actor.status === "unavailable") return <Indisponivel />;
  if (actor.status !== "ok") redirect("/recordings");

  const det = await getRecordingForActor(actor.data, id);
  if (det.status === "unavailable") return <Indisponivel />;
  if (det.status === "not-found") notFound();
  if (det.status === "forbidden") {
    return (
      <main className="p-8 text-sm">
        Você não tem acesso a esta gravação.{" "}
        <Link href="/recordings" className="text-primary underline">
          Voltar
        </Link>
      </main>
    );
  }
  const r = det.data;
  const podeDeletar = canDelete(actor.data, r);
  const podeModerar = canToggleVisibility(actor.data);
  const verVis = podeModerar || r.authorId === actor.data.profileId;
  const areasRes = isModerator(actor.data) ? await listAreas(actor.data.workspaceId) : null;
  const areas = areasRes && areasRes.status === "ok" ? areasRes.areas : [];
  const outputs = await getRecordingOutputs(actor.data.workspaceId, id);

  // ---- Server Actions (re-checam ator + política no lib) -------------------
  async function alternarVis(fd: FormData) {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const alvo = String(fd.get("alvo") ?? "");
    const res = await setVisibility(a.data, id, alvo === "private" ? "private" : "public");
    // O detalhe é leitura não-cacheada (re-renderiza fresco); só a LISTA cacheada precisa invalidar.
    if (res.status === "ok") updateTag(recordingsTag(a.data.workspaceId));
    else redirect(`/recordings/${id}?erro=` + encodeURIComponent(res.status === "invalid" ? res.reason : "indisponível"));
  }
  async function reatribuirArea(fd: FormData) {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const res = await setRecordingArea(a.data, id, String(fd.get("areaId") ?? ""));
    if (res.status === "ok") updateTag(recordingsTag(a.data.workspaceId));
    else redirect(`/recordings/${id}?erro=` + encodeURIComponent(res.status === "invalid" ? res.reason : "indisponível"));
  }
  async function deletar() {
    "use server";
    const a = await getActor();
    if (a.status !== "ok") redirect("/recordings");
    const res = await softDeleteRecording(a.data, id);
    if (res.status === "ok") {
      updateTag(recordingsTag(a.data.workspaceId));
      redirect("/recordings");
    }
    redirect(`/recordings/${id}?erro=` + encodeURIComponent(res.status === "invalid" ? res.reason : "indisponível"));
  }

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        {/* pendente (sua) → poll rápido p/ pegar o back virar 'done' + relatório; senão, base 60s */}
        <AutoRefresh
          intervalMs={60000}
          fastIntervalMs={10000}
          fast={r.status === "awaiting_processing" || r.status === "processing"}
        />
        <Link
          href="/recordings"
          data-testid="voltar"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Gravações
        </Link>

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
          {/* COLUNA ESQUERDA */}
          <div className="flex flex-col gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid="status"
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    STATUS_STYLE[r.status] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {statusLabel(r.status)}
                </span>
                {verVis && (
                  <span
                    data-testid="visibilidade"
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                  >
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
                {r.deleted && (
                  <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">deletada</span>
                )}
              </div>
              <h1 data-testid="titulo" className="mt-2 text-2xl font-semibold tracking-tight">
                {r.titulo ?? fmtDate(r.createdAt)}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {r.areaName ?? "?"} · {r.authorNome ?? "?"} · {fmtDate(r.createdAt)}
                {r.duracaoSeg != null && ` · ${r.duracaoSeg}s`}
              </p>
            </div>

            {/* Player */}
            <Card>
              <CardContent className="p-4">
                {r.driveFileId ? (
                  <audio controls preload="none" className="w-full" data-testid="player">
                    <source src={`/api/recordings/${id}/audio`} />
                  </audio>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="sem-audio">
                    Áudio indisponível.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Resumo (back-p) */}
            {r.resumo && (
              <div className="rounded-xl bg-accent/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground/70">Resumo</p>
                <p className="mt-1 text-sm" data-testid="resumo">
                  {r.resumo}
                </p>
              </div>
            )}

            {/* Observações (view-only) */}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Observações</h2>
                <Badge variant="secondary">somente leitura</Badge>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground" data-testid="obs-texto">
                {r.observacoes ?? "(sem observações)"}
              </p>
            </div>

            {/* Tags */}
            {r.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="tags">
                {r.tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}

            {/* Moderação */}
            {(podeModerar || (podeDeletar && !r.deleted)) && (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <h2 className="text-sm font-semibold">Moderação</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {podeModerar && (
                    <form action={alternarVis}>
                      <input type="hidden" name="alvo" value={r.visibilidade === "public" ? "private" : "public"} />
                      <Button type="submit" size="sm" variant="outline" data-testid="toggle-vis">
                        {r.visibilidade === "public" ? "Tornar privada" : "Tornar pública"}
                      </Button>
                    </form>
                  )}

                  {podeModerar && areas.length > 0 && (
                    <form action={reatribuirArea} className="flex items-center gap-2">
                      {/* key: remonta o select após revalidatePath (APR-008). */}
                      <select
                        key={r.areaId ?? "none"}
                        name="areaId"
                        defaultValue={r.areaId ?? ""}
                        data-testid="area-select"
                        className="h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" variant="outline" data-testid="area-mover">
                        Mover área
                      </Button>
                    </form>
                  )}

                  {podeDeletar && !r.deleted && <DeleteRecordingButton action={deletar} />}
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: saída do back-p */}
          <div>
            <RecordingOutputs
              status={r.status}
              report={outputs.report ?? null}
              transcription={outputs.transcription ?? null}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
