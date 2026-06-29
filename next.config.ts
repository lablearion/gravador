import type { NextConfig } from "next";

// Origens de TÚNEL (ngrok/cloudflared) para testar no celular durante o DEV. Ficam em
// `.env.local` (DEV_TUNNEL_ORIGINS, NÃO versionado) — então não vão para o commit e, em produção,
// a variável não existe → lista vazia → só same-origin é permitido (seguro). Aceita wildcard.
const tunnelOrigins = (process.env.DEV_TUNNEL_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Service worker: nunca cachear o /sw.js (usuário sempre pega a versão nova) + Content-Type correto.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  // Dev-only: libera os recursos /_next/* quando o app é servido pelo túnel (senão o JS não hidrata).
  allowedDevOrigins: tunnelOrigins,
  // Esconde o indicador de dev do Next (o "N" no canto) — atrapalhava elementos da UI. Só afeta o DEV.
  devIndicators: false,
  experimental: {
    // Client Router Cache: reusa o segmento de página por N s ao navegar entre telas (sem refetch).
    // Combina com o cache de dados por workspace + revalidateTag nas mutações (DEC-018/DEV-030).
    // `dynamic` cobre páginas dinâmicas (todas aqui, por dependerem de auth). Mutações via Server
    // Action já forçam refresh da rota atual, então isto só afeta re-visitas a outra tela.
    staleTimes: {
      dynamic: 30,
    },
    serverActions: {
      // Libera as Server Actions (abrir sessão de upload / finalizar) pela origem do túnel.
      // O ÁUDIO não passa mais por Server Action (sobe direto browser→Drive via upload resumível —
      // REQ-006), então o default de bodySizeLimit (1MB) basta: os corpos agora são só metadados.
      allowedOrigins: tunnelOrigins,
    },
  },
};

export default nextConfig;
