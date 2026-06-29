"use client";

// UI "burra" (princípio da spec-interacao): estado global de backend indisponível.
// DEC-012 / REQ-023. Botão recarrega a rota atual para reavaliar a disponibilidade.
export default function Indisponivel() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-10 text-center">
      <h1 className="text-xl font-semibold">Serviço temporariamente indisponível</h1>
      <p className="max-w-sm text-zinc-600">
        Não foi possível conectar ao banco de dados. Tente novamente em alguns minutos.
      </p>
      <button
        onClick={() => location.reload()}
        className="rounded bg-blue-600 px-4 py-2 text-white"
        data-testid="tentar-de-novo"
      >
        Tentar de novo
      </button>
    </main>
  );
}
