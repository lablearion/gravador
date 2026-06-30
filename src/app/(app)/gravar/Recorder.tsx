"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUploadSessionAction, finalizeRecordingAction } from "./actions";
import { appendChunk, getChunks, clearChunks } from "@/lib/recordingStore";
import { useNavGuard } from "@/components/nav-guard";
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// Fluxo de gravação — modo livre (DEC-016). Captura ao vivo do mic e visualizador NÃO são testáveis
// de forma automatizada (headless não tem mic) — teste manual do dono.
//
// ⚠️ UI ATUAL É CRUA (andaime de dev). Na UI DEFINITIVA as caixas viram POP-UPS MODAIS BLOQUEANTES
// (uma por vez, travam a tela até resolver) e o visualizador ganha estilo. Ver spec-interacao.md
// ("Gravar" + "UI definitiva (pendências)"). Não tome esta UI como o alvo visual.

type Phase = "idle" | "recording" | "paused";
const BARS = 16;

function pickMime(): string {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of cands)
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  return "";
}

// PUT do áudio DIRETO no Drive (browser→Google, REQ-006), com progresso. Via XHR porque o fetch não
// reporta progresso de upload. A session URI é cross-origin, mas o Google libera CORS porque o servidor
// abriu a sessão passando o header Origin (ver lib/drive.createResumableSession). Resolve com o JSON
// final do Drive ({ id }).
function putToDrive(
  url: string,
  blob: Blob,
  onProgress: (pct: number) => void,
): Promise<{ id?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", blob.type || "audio/webm");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({});
        }
      } else {
        reject(new Error(`upload ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("falha de rede no upload"));
    xhr.send(blob);
  });
}

export default function Recorder() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [hasAudio, setHasAudio] = useState(false); // áudio capturado e ainda não salvo/descartado
  const [showSave, setShowSave] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [obs, setObs] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false); // trava reentrada do salvar (evita duplo-save)
  const [bars, setBars] = useState<number[]>(() => Array(BARS).fill(0)); // visualizador (nível por faixa)
  const [playUrl, setPlayUrl] = useState<string | null>(null);

  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const router = useRouter();
  const guard = useNavGuard();
  // Destino pendente quando o usuário escolhe "Salvar" na caixa de saída (navega após salvar).
  const navAfterSaveRef = useRef<string | null>(null);

  // Mantém o NavGuard a par de haver áudio não salvo: os links do menu (NavLink) usam isso para
  // interceptar a navegação interna. Ao desmontar (já saímos), limpa.
  useEffect(() => {
    guard.setDirty(hasAudio);
    return () => guard.setDirty(false);
  }, [hasAudio, guard]);

  // Pedido de sair (um NavLink foi clicado com áudio não salvo): pausa a gravação e fecha as outras
  // caixas — a caixa de saída (Descartar/Salvar/Fechar) é renderizada quando guard.pending != null.
  useEffect(() => {
    if (!guard.pending) return;
    if (mrRef.current?.state === "recording") pause();
    setShowSave(false);
    setShowDiscard(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard.pending]);

  // Avisa o navegador ao fechar/recarregar a aba com áudio não salvo. A navegação INTERNA (sair da
  // rota pelo menu) é interceptada via NavGuard + NavLink (onNavigate) → caixa "popup-sair".
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (hasAudio) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [hasAudio]);

  function startTimer() {
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }
  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function startMeter(stream: MediaStream) {
    const ac = new AudioContext();
    acRef.current = ac;
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();
    an.fftSize = 64;
    src.connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    const tick = () => {
      an.getByteFrequencyData(data);
      // amostra BARS faixas do espectro → barras tipo equalizador (indica voz, não "carregando").
      const step = Math.floor(data.length / BARS) || 1;
      const next: number[] = [];
      for (let i = 0; i < BARS; i++) next.push((data[i * step] ?? 0) / 255);
      setBars(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopMeter() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    acRef.current?.close().catch(() => {});
    acRef.current = null;
    setBars(Array(BARS).fill(0));
  }

  async function start() {
    // Contexto seguro: getUserMedia só existe em HTTPS ou localhost. Em http (ex.: IP da LAN aberto no
    // celular) `navigator.mediaDevices` é undefined → mensagem clara em vez de "nada acontece".
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("Microfone indisponível aqui. É preciso HTTPS (deploy ou túnel), não http://IP.");
      return;
    }
    // Feedback imediato: o getUserMedia pode demorar (prompt de permissão). Sem isso, parece que
    // "nada acontece" (feedback de estado — spec-interacao Princípios).
    setStatus("Iniciando… permita o acesso ao microfone.");
    try {
      await clearChunks();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) appendChunk(e.data);
      };
      mrRef.current = mr;
      // timeslice curto (1s): menos cauda perdida e preview mais fiel (DEC-016 / OBS bugs de mic).
      mr.start(1000);
      setElapsed(0);
      startTimer();
      startMeter(stream);
      setHasAudio(true);
      setPhase("recording");
      setStatus("");
    } catch (err) {
      setStatus("Não foi possível acessar o microfone: " + (err as Error).message);
    }
  }

  // Descarrega o buffer atual antes de pausar (melhora o preview — best-effort).
  function flush() {
    const mr = mrRef.current;
    if (mr && mr.state === "recording") {
      try {
        mr.requestData();
      } catch {}
    }
  }

  function pause() {
    flush();
    mrRef.current?.pause();
    stopTimer();
    stopMeter();
    setPhase("paused");
  }
  function resume() {
    mrRef.current?.resume();
    startTimer();
    if (streamRef.current) startMeter(streamRef.current);
    setPhase("recording");
  }

  // Abrir QUALQUER caixa pausa a gravação e fecha a outra (uma por vez).
  function openSave() {
    if (phase === "recording") pause();
    setShowDiscard(false);
    setShowSave(true);
  }
  function openDiscard() {
    if (phase === "recording") pause();
    setShowSave(false);
    setShowDiscard(true);
  }

  async function play() {
    flush();
    await new Promise((r) => setTimeout(r, 60)); // deixa o ondataavailable gravar o flush
    const chunks = await getChunks();
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: mrRef.current?.mimeType || "audio/webm" });
    if (playUrl) URL.revokeObjectURL(playUrl);
    setPlayUrl(URL.createObjectURL(blob));
  }

  // Encerra o MediaRecorder de fato (libera o mic, descarrega o último chunk).
  function finalize(): Promise<void> {
    return new Promise((res) => {
      const mr = mrRef.current;
      if (!mr || mr.state === "inactive") return res();
      mr.onstop = () => res();
      try {
        mr.stop();
      } catch {
        res();
      }
    });
  }

  function teardown() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopMeter();
    stopTimer();
  }
  function reset() {
    setPhase("idle");
    setShowSave(false);
    setShowDiscard(false);
    setHasAudio(false);
    setTitulo("");
    setObs("");
    setElapsed(0);
    if (playUrl) URL.revokeObjectURL(playUrl);
    setPlayUrl(null);
    mrRef.current = null;
    streamRef.current = null;
  }

  async function save() {
    if (saving) return; // já está salvando: ignora cliques repetidos (evita gravar 2x — feedback do dono)
    setSaving(true);
    setStatus("Salvando…");
    await finalize();
    teardown();
    const chunks = await getChunks();
    const blob = new Blob(chunks, { type: mrRef.current?.mimeType || "audio/webm" });
    try {
      await sendBlob(blob, elapsed);
      await clearChunks();
      reset();
      setStatus("Salvo! ✓");
      // Veio da caixa de saída ("Salvar e sair")? Agora navega para o destino pedido.
      const to = navAfterSaveRef.current;
      navAfterSaveRef.current = null;
      if (to) {
        guard.clearPending();
        router.push(to);
      }
    } catch (err) {
      setStatus("Erro ao salvar: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function discard() {
    await finalize();
    teardown();
    await clearChunks();
    reset();
    setStatus("Descartado.");
  }

  // ---- Caixa de saída (sair da rota com gravação não salva — DEC-016/REQ-005) ----
  // Fechar: cancela a saída (fica na tela, gravação pausada).
  function leaveClose() {
    guard.clearPending();
  }
  // Descartar: joga fora o áudio e segue para o destino pedido.
  async function leaveDiscard() {
    const to = guard.pending;
    await discard();
    guard.clearPending();
    if (to) router.push(to);
  }
  // Salvar: abre a caixa de salvar; após salvar com sucesso, navega (ver save()).
  function leaveSave() {
    navAfterSaveRef.current = guard.pending;
    guard.clearPending();
    setShowSave(true);
  }

  // Upload em 3 passos (REQ-006): (1) servidor abre a sessão resumível → session URI; (2) browser dá
  // o PUT do áudio DIRETO no Drive (não passa pelo servidor → sem o cap ~4.5MB da Vercel); (3) servidor
  // cria a entrada no banco. O segredo do Drive nunca vai ao cliente.
  async function sendBlob(blob: Blob, dur: number) {
    const mimeType = blob.type || "audio/webm";
    const { sessionUrl } = await createUploadSessionAction({ mimeType, titulo });
    setStatus("Enviando… 0%");
    const { id: fileId } = await putToDrive(sessionUrl, blob, (pct) => setStatus(`Enviando… ${pct}%`));
    if (!fileId) throw new Error("upload sem id");
    setStatus("Finalizando…");
    await finalizeRecordingAction({
      fileId,
      titulo: titulo || null,
      observacoes: obs || null,
      duracao: dur || null,
      sizeBytes: blob.size || null,
    });
  }

  // Hook de teste (OBS-005): enviar um arquivo de áudio, sem usar o mic.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setStatus("Enviando arquivo…");
    try {
      await sendBlob(f, 0);
      setStatus("Salvo! ✓");
    } catch (err) {
      setStatus("Erro ao salvar: " + (err as Error).message);
    }
  }

  const recording = phase === "recording";
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const fase = recording ? "Gravando" : phase === "paused" ? "Pausado" : "Pronto";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-4 lg:max-w-lg lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-10 lg:shadow-[var(--shadow-sm)]">
      {/* Status (fase) */}
      <span
        data-testid="fase"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
          recording
            ? "bg-destructive/15 text-destructive"
            : phase === "paused"
              ? "bg-warning/20 text-warning"
              : "bg-muted text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            recording ? "animate-pulse bg-destructive" : phase === "paused" ? "bg-warning" : "bg-muted-foreground",
          )}
        />
        {fase}
      </span>

      {/* Cronômetro */}
      <p className="font-mono text-5xl font-semibold tabular-nums tracking-tight" data-testid="cronometro">
        {mmss}
      </p>

      {/* Visualizador de nível de voz (equalizador) — anima durante a gravação. */}
      <div className="flex h-14 w-full items-center justify-center gap-1" data-testid="visualizador">
        {bars.map((v, i) => (
          <div
            key={i}
            className={cn("w-1.5 rounded-full transition-[height] duration-75", recording ? "bg-primary" : "bg-muted")}
            style={{ height: `${Math.max(6, Math.round(v * 100))}%` }}
          />
        ))}
      </div>

      {/* Botão central (Gravar → Pausar → Retomar). */}
      <div className="relative flex items-center justify-center">
        {recording && <span className="absolute inset-0 animate-ping rounded-full bg-destructive/30" />}
        {phase === "paused" ? (
          <button
            onClick={resume}
            data-testid="retomar"
            aria-label="Retomar"
            className="relative flex size-28 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-[var(--shadow-primary)] transition-transform active:scale-95"
          >
            <Mic className="size-10" />
          </button>
        ) : (
          <button
            onClick={recording ? pause : start}
            data-rec={recording}
            data-testid={recording ? "pausar" : "gravar"}
            aria-label={recording ? "Pausar" : "Gravar"}
            className={cn(
              "relative flex size-28 items-center justify-center rounded-full text-primary-foreground shadow-[var(--shadow-primary)] transition-transform active:scale-95",
              recording ? "bg-destructive" : "bg-gradient-to-br from-primary to-[oklch(0.34_0.16_288)]",
            )}
          >
            {recording ? <Pause className="size-10" /> : <Mic className="size-10" />}
          </button>
        )}
      </div>

      {/* Hint / status */}
      <p className="min-h-5 text-center text-sm text-muted-foreground" data-testid="status">
        {status ||
          (recording
            ? "Toque para pausar"
            : phase === "paused"
              ? "Pausado — retome, reproduza ou pare"
              : "Toque para começar a gravar")}
      </p>

      {/* Controles secundários */}
      <div className="grid w-full grid-cols-3 gap-2">
        <Button onClick={play} disabled={recording || !hasAudio} variant="outline" data-testid="reproduzir">
          <Play data-icon="inline-start" /> Reproduzir
        </Button>
        <Button onClick={openSave} disabled={phase === "idle"} variant="outline" data-testid="parar">
          <Square data-icon="inline-start" /> Parar
        </Button>
        <Button
          onClick={openDiscard}
          disabled={!hasAudio}
          variant="outline"
          data-testid="descartar-btn"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 data-icon="inline-start" /> Descartar
        </Button>
      </div>

      {playUrl && <audio src={playUrl} controls autoPlay className="w-full" data-testid="player" />}

      {/* Hook de teste (OBS-005): única via de testar salvar→Drive SEM mic. Escondido em produção. */}
      {process.env.NODE_ENV !== "production" && (
        <label className="text-xs text-muted-foreground">
          (teste) enviar um arquivo de áudio:{" "}
          <input type="file" accept="audio/*" onChange={onFile} data-testid="arquivo" />
        </label>
      )}

      {/* ===== Modais bloqueantes (DEC-016) ===== */}
      {/* Salvar (vem do Parar). */}
      <Dialog
        open={showSave}
        onOpenChange={(o) => {
          if (!o) setShowSave(false);
        }}
      >
        <DialogContent data-testid="popup-salvar">
          <DialogHeader>
            <DialogTitle>Salvar gravação</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} data-testid="titulo" />
            <Textarea
              placeholder="Observações"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              data-testid="obs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSave(false)} disabled={saving} data-testid="cancelar">
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving} data-testid="salvar">
              {saving ? (
                <>
                  <Spinner data-icon="inline-start" /> Salvando…
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sair da rota com gravação não salva (DEC-016/REQ-005). */}
      <Dialog
        open={!!guard.pending}
        onOpenChange={(o) => {
          if (!o) leaveClose();
        }}
      >
        <DialogContent data-testid="popup-sair">
          <DialogHeader>
            <DialogTitle>Gravação não salva</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Você tem uma gravação não salva. O que deseja fazer?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={leaveClose} data-testid="sair-fechar">
              Continuar gravando
            </Button>
            <Button
              variant="outline"
              onClick={leaveDiscard}
              data-testid="sair-descartar"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Descartar e sair
            </Button>
            <Button onClick={leaveSave} data-testid="sair-salvar">
              Salvar e sair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar descarte (vem da lixeira). */}
      <AlertDialog
        open={showDiscard}
        onOpenChange={(o) => {
          if (!o) setShowDiscard(false);
        }}
      >
        <AlertDialogContent data-testid="popup-descartar">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar a gravação?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscard(false)} data-testid="cancelar-descarte">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={discard}
              data-testid="confirmar-descarte"
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
