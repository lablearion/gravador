// Rótulos de status em pt-br (REQ-028/DEC-015). Módulo PURO (sem deps de servidor) para poder ser
// importado tanto por Server Components quanto por ilhas client (ex.: a lista). O valor cru em inglês
// fica no DB; aqui só o mapa de exibição.
export const STATUS_LABELS: Record<string, string> = {
  awaiting_processing: "Aguardando",
  processing: "Processando",
  done: "Pronta",
  error: "Erro no processamento",
};

export const statusLabel = (status: string): string => STATUS_LABELS[status] ?? status;
