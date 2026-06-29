"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

// Saída do back-p (REQ-009): Relatório (Markdown renderizado) + Transcrição (Texto/SRT). Só quando processada.
export function RecordingOutputs({
  status,
  report,
  transcription,
}: {
  status: string;
  report: { relatorioMd: string | null; model: string | null } | null;
  transcription: { texto: string | null; srt: string | null; model: string | null } | null;
}) {
  const hasReport = !!report?.relatorioMd;
  const hasTrans = !!(transcription && (transcription.texto || transcription.srt));

  if (!hasReport && !hasTrans) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        {status === "error" ? (
          "O processamento falhou."
        ) : (
          <>
            <Spinner />
            <span>O relatório e a transcrição aparecem aqui quando o processamento terminar.</span>
          </>
        )}
      </div>
    );
  }

  return (
    <Tabs defaultValue={hasReport ? "relatorio" : "transcricao"} className="gap-3">
      <TabsList>
        {hasReport && <TabsTrigger value="relatorio">Relatório</TabsTrigger>}
        {hasTrans && <TabsTrigger value="transcricao">Transcrição</TabsTrigger>}
      </TabsList>

      {hasReport && (
        <TabsContent value="relatorio" data-testid="relatorio">
          <article className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report!.relatorioMd}</ReactMarkdown>
          </article>
        </TabsContent>
      )}

      {hasTrans && (
        <TabsContent value="transcricao" data-testid="transcricao">
          <TranscriptionView texto={transcription!.texto} srt={transcription!.srt} />
        </TabsContent>
      )}
    </Tabs>
  );
}

function TranscriptionView({ texto, srt }: { texto: string | null; srt: string | null }) {
  const hasTexto = !!texto;
  const hasSrt = !!srt;
  const srtBlock = (
    <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{srt}</pre>
  );
  const textoBlock = <p className="whitespace-pre-wrap text-sm leading-relaxed">{texto}</p>;

  if (hasTexto && hasSrt) {
    return (
      <Tabs defaultValue="texto" className="gap-2">
        <TabsList>
          <TabsTrigger value="texto">Texto</TabsTrigger>
          <TabsTrigger value="srt">SRT</TabsTrigger>
        </TabsList>
        <TabsContent value="texto">{textoBlock}</TabsContent>
        <TabsContent value="srt">{srtBlock}</TabsContent>
      </Tabs>
    );
  }
  return hasTexto ? textoBlock : srtBlock;
}

// Deletar gravação (REQ-011) com confirmação. Submete a MESMA server action (prop).
export function DeleteRecordingButton({ action }: { action: () => void | Promise<void> }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-testid="deletar"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 data-icon="inline-start" /> Deletar gravação
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deletar gravação?</AlertDialogTitle>
          <AlertDialogDescription>
            Ela sai da listagem padrão. Moderadores ainda conseguem recuperá-la depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <form action={action}>
            <AlertDialogAction type="submit">Deletar</AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
