"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

// Guard de navegação para a gravação não salva (DEC-016/REQ-005).
// O Recorder marca `dirty` quando há áudio não salvo; os links do menu (NavLink) checam isso
// no onNavigate e, se houver áudio, NÃO navegam: registram o destino em `pending`. O Recorder,
// que está montado em /gravar, vê o `pending` e abre a caixa Descartar/Salvar/Fechar.
// O beforeunload (no Recorder) continua cobrindo fechar/recarregar a aba — onNavigate só pega
// navegação interna (SPA).
interface NavGuard {
  dirty: boolean;
  setDirty: (b: boolean) => void;
  pending: string | null; // destino pedido enquanto havia áudio não salvo
  requestLeave: (href: string) => void;
  clearPending: () => void;
}

const Ctx = createContext<NavGuard | null>(null);

export function NavGuardProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirtyState] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const setDirty = useCallback((b: boolean) => {
    dirtyRef.current = b;
    setDirtyState(b);
  }, []);
  const requestLeave = useCallback((href: string) => setPending(href), []);
  const clearPending = useCallback(() => setPending(null), []);

  const value = useMemo<NavGuard>(
    () => ({ dirty, setDirty, pending, requestLeave, clearPending }),
    [dirty, setDirty, pending, requestLeave, clearPending]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Hook tolerante: fora do provider (ex.: telas pré-app) devolve um no-op, então NavLink funciona
// como um link normal sem quebrar.
export function useNavGuard(): NavGuard {
  return (
    useContext(Ctx) ?? {
      dirty: false,
      setDirty: () => {},
      pending: null,
      requestLeave: () => {},
      clearPending: () => {},
    }
  );
}
