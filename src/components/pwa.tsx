"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, Plus, X, Mic, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// ============================================================================
// Runtime + UI de instalação do PWA (Fase B).
//
// VISIBILIDADE = "NÃO está instalado neste aparelho" — e SÓ isso. NÃO depende do `beforeinstallprompt`
// (esse evento pisca/é inconsistente entre navegadores). O `beforeinstallprompt` serve só pra ACIONAR a
// instalação nativa quando disponível.
//
// "Instalado aqui?" combina três sinais (qualquer um ⇒ instalado), por DISPOSITIVO, nunca no DB:
//   1. `display-mode: standalone` (está rodando como o app instalado).
//   2. `navigator.getInstalledRelatedApps()` — pergunta ao SO se ESTE PWA está instalado (Chromium; usa o
//      `related_applications` auto-referenciado no manifesto). É o que detecta instalação no NAVEGADOR,
//      inclusive no Brave (que NÃO dispara `appinstalled` de forma confiável).
//   3. flag local `appinstalled` (Chrome). `beforeinstallprompt` LIMPA esse flag (prova de não-instalado)
//      → auto-corrige flag preso após desinstalar.
//
// Popup: aparece **só na abertura/login** enquanto não instalado (sem throttle de 12h). Pós-instalação:
// popup de sucesso com a cara do ícone (a web NÃO permite abrir o app / fechar o navegador automaticamente).
// ============================================================================

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// ---- store de módulo (version counter p/ useSyncExternalStore) ----
let deferred: BIPEvent | null = null;
let forceOpen = false;
let installedFlag = false; // appinstalled → dispara o popup de sucesso
let relatedInstalled = false; // getInstalledRelatedApps detectou ESTE PWA instalado
let version = 0;
const subscribers = new Set<() => void>();
function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
function bump() {
  version++;
  subscribers.forEach((cb) => cb());
}
function setDeferred(e: BIPEvent | null) {
  deferred = e;
  bump();
}
function setForceOpen(v: boolean) {
  forceOpen = v;
  bump();
}
function setInstalledFlag(v: boolean) {
  installedFlag = v;
  bump();
}
function setRelatedInstalled(v: boolean) {
  relatedInstalled = v;
  bump();
}

// ---- estado LOCAL por dispositivo ----
const K_INSTALLED = "pwa-installed-here";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
function markInstalledHere() {
  try {
    localStorage.setItem(K_INSTALLED, "1");
  } catch {}
}
function clearInstalledHere() {
  try {
    localStorage.removeItem(K_INSTALLED);
  } catch {}
}
function installedHere() {
  if (typeof window === "undefined") return false;
  if (isStandalone() || relatedInstalled) return true;
  try {
    return localStorage.getItem(K_INSTALLED) === "1";
  } catch {
    return false;
  }
}
// Instalar PWA é coisa de CELULAR (decisão do dono): o popup e os botões NUNCA aparecem no desktop.
// Heurística por user-agent (mesma regex do lib/device.ts) — é só cosmético (esconder a oferta de
// instalação no desktop), NÃO é feature-gating de segurança.
function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(
    navigator.userAgent,
  );
}
// Visibilidade: oferecer instalação? = é celular E não está instalado neste aparelho.
function offerInstall() {
  return isMobileDevice() && !installedHere();
}
function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
// Brave injeta `navigator.brave`. Brave dispara `beforeinstallprompt` MESMO com o app instalado (deixa
// reinstalar) e `getInstalledRelatedApps()` volta vazio → o tratamento de "instalado" precisa diferir do Chrome.
function isBrave() {
  if (typeof navigator === "undefined") return false;
  return !!(navigator as unknown as { brave?: unknown }).brave;
}

// Aciona a instalação. Com prompt nativo (Chrome/Android) → prompt(). Sem prompt (Brave/iOS) → abre o
// popup com as instruções manuais.
async function runInstall() {
  if (deferred) {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") markInstalledHere();
    setDeferred(null);
    return;
  }
  setForceOpen(true);
}

// Quadradinho com a cara do ícone (gradiente índigo + microfone).
function MarkBadge({ size = 80 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-[22%] bg-gradient-to-br from-primary to-[oklch(0.34_0.16_288)] text-primary-foreground shadow-[var(--shadow-primary)]"
    >
      <Mic style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

// Registra SW + captura instalação + consulta o SO. Sempre montado (root layout).
export function PwaRuntime() {
  useEffect(() => {
    if (isStandalone()) markInstalledHere();
    // Detecção via SO (Chromium): ESTE PWA está instalado neste aparelho? (funciona no navegador, Brave incluso)
    const nav = navigator as unknown as {
      getInstalledRelatedApps?: () => Promise<unknown[]>;
    };
    if (typeof nav.getInstalledRelatedApps === "function") {
      nav
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            markInstalledHere();
            setRelatedInstalled(true);
          }
        })
        .catch(() => {});
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onBIP = (e: Event) => {
      e.preventDefault();
      // Chrome: o BIP só dispara quando NÃO está instalado → limpa flag preso (auto-heal pós-desinstalar).
      // Brave: dispara MESMO instalado → NÃO limpar, senão o F5/relogin volta a mostrar tudo após instalar.
      if (!isBrave()) {
        clearInstalledHere();
        setRelatedInstalled(false);
      }
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      markInstalledHere();
      setDeferred(null);
      setInstalledFlag(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

// O convite deve aparecer? (= não instalado aqui; com guarda de hidratação). Re-renderiza quando o store muda.
function useInstallable() {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => -1,
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return { mounted, available: mounted && offerInstall() };
}

// Item "Instalar app" no menu do avatar.
export function InstallMenuItem() {
  const { available } = useInstallable();
  if (!available) return null;
  return (
    <button
      type="button"
      data-testid="instalar-app"
      onClick={() => runInstall()}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50"
    >
      <Download className="size-4" /> Instalar app
    </button>
  );
}

// Botão de instalar na topbar mobile (à esquerda do avatar) — botão primário, igual ao do popup.
export function InstallTopbarButton() {
  const { available } = useInstallable();
  if (!available) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          data-testid="instalar-app-topbar"
          onClick={() => runInstall()}
          className="shrink-0 gap-1.5"
        >
          <Download className="size-4" /> Instalar app
        </Button>
      </TooltipTrigger>
      <TooltipContent>Instalar o aplicativo</TooltipContent>
    </Tooltip>
  );
}

// Instruções quando não há prompt nativo (Brave/Android sem prompt, ou iOS).
function ManualSteps({ ios }: { ios: boolean }) {
  return (
    <ol className="space-y-3 rounded-xl border border-border bg-card p-4 text-left text-sm">
      {ios ? (
        <>
          <li className="flex items-center gap-2.5">
            <Share className="size-5 shrink-0 text-primary" />
            <span>
              Toque em <strong>Compartilhar</strong> na barra do Safari.
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <Plus className="size-5 shrink-0 text-primary" />
            <span>
              Escolha <strong>Adicionar à Tela de Início</strong>.
            </span>
          </li>
        </>
      ) : (
        <>
          <li className="flex items-center gap-2.5">
            <MoreVertical className="size-5 shrink-0 text-primary" />
            <span>
              Abra o <strong>menu</strong> do navegador (⋮).
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <Download className="size-5 shrink-0 text-primary" />
            <span>
              Toque em <strong>Instalar app</strong> (ou “Adicionar à tela inicial”).
            </span>
          </li>
        </>
      )}
    </ol>
  );
}

// Popup full-screen — aparece SÓ na abertura/login enquanto não instalado (sem throttle). Fecha no X
// (volta no próximo login). `forceOpen` é o gatilho manual (iOS/Brave sem prompt).
export function InstallPopup() {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => -1,
  );
  const [mounted, setMounted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    setMounted(true);
    setIsIOS(isIOSDevice());
  }, []);

  const open = mounted && !closed && (offerInstall() || forceOpen);
  const canPrompt = deferred !== null;

  const close = useCallback(() => {
    setClosed(true);
    setForceOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  async function install() {
    await runInstall();
    if (deferred === null && !isIOS) close();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Instalar aplicativo"
      data-testid="install-popup"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-7 bg-background/97 px-6 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Fechar"
        data-testid="install-popup-fechar"
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <X className="size-5" />
      </button>

      <div className="flex flex-col items-center gap-5 text-center">
        <MarkBadge size={80} />
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">Instale o Gravador</h2>
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">
            Use como aplicativo: abre rápido, em tela cheia e direto da tela de início.
          </p>
        </div>

        {canPrompt ? (
          <Button size="lg" data-testid="install-popup-instalar" onClick={install} className="gap-2">
            <Download className="size-4" /> Instalar app
          </Button>
        ) : (
          <ManualSteps ios={isIOS} />
        )}
      </div>
    </div>
  );
}

// Popup de SUCESSO pós-instalação. Mostra a cara do ícone + instrução (a web não permite abrir o app /
// fechar o navegador automaticamente).
export function InstallSuccessPopup() {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => -1,
  );
  if (!installedFlag) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App instalado"
      data-testid="install-success"
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-background/97 px-6 text-center backdrop-blur-sm"
    >
      <MarkBadge size={96} />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Gravador instalado!</h2>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          Feche esta aba e abra o app pela sua tela de início, procurando por este ícone (acima).
        </p>
      </div>
      <Button
        size="lg"
        data-testid="install-success-ok"
        onClick={() => setInstalledFlag(false)}
        className="gap-2"
      >
        Entendi
      </Button>
    </div>
  );
}
