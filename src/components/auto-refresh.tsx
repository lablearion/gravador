"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Atualização "ao vivo" SEM Realtime (DEC-018): polling leve + refresh ao focar a aba. Cada tick chama
// `router.refresh()` — re-roda os Server Components e reconcilia SÓ os dados/cards no lugar (não recarrega
// a página, não perde scroll/estado client). É BARATO: passa pelo cache+RBAC que já temos, então a maioria
// dos ticks bate no cache (sem ir ao banco) e reconcilia pra mesma UI; só re-consulta quando uma mutação do
// app invalidou o cache do workspace (inclui ações de OUTROS usuários, que invalidam o cache compartilhado).
//
// Estratégia (DEV-033):
//  - intervalo ADAPTATIVO: `fast` (ex.: há gravação própria aguardando/processando) usa `fastIntervalMs`;
//    senão, `intervalMs` de base. É UM timer só (não dois simultâneos), que troca de período.
//  - só roda com a aba VISÍVEL (Page Visibility API) — tela apagada / aba em segundo plano = pausa.
//  - ao VOLTAR pra aba, atualiza na hora (refresh-ao-focar).
//  - NÃO atualiza enquanto o usuário digita/edita (input/textarea/select focado) — não atrapalha.
export function AutoRefresh({
  intervalMs,
  fastIntervalMs,
  fast = false,
}: {
  intervalMs: number;
  fastIntervalMs?: number;
  fast?: boolean;
}) {
  const router = useRouter();
  const effective = fast && fastIntervalMs ? fastIntervalMs : intervalMs;

  // `refresh` num ref para o efeito não re-armar o timer a cada render do router.
  const refresh = useRef<() => void>(() => {});
  refresh.current = () => {
    if (document.visibilityState !== "visible") return;
    const el = document.activeElement;
    const tag = el?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // não interrompe digitação/edição
    router.refresh();
  };

  useEffect(() => {
    if (!effective || effective <= 0) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(() => refresh.current(), effective);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh.current(); // refresh-ao-focar
        start();
      } else {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible") start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [effective]);

  return null;
}
