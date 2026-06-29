import type { MetadataRoute } from "next";
import { headers } from "next/headers";

// Web App Manifest (Fase B — PWA instalável). Nome/identidade GENÉRICOS (Questão #2, resolvida 2026-06-29):
// mantém "Gravador". Ícones gerados por código (símbolo abstrato em app/icons/[size]). theme/background em
// HEX (≈ tokens OKLCH do globals.css); background = tema ESCURO (splash sem branco).
//
// DINÂMICO de propósito: injeta a URL REAL do manifesto (origem atual) em `related_applications`
// (auto-referência) — é o que `navigator.getInstalledRelatedApps()` usa para detectar que ESTE PWA está
// instalado neste aparelho (a origem varia: localhost, túnel, prod). `prefer_related_applications:false`
// mantém a preferência pelo próprio PWA (não desvia para um app nativo "relacionado").
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  return {
    id: "/",
    name: "Gravador",
    short_name: "Gravador",
    description: "Gravação de áudio por workspace.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    dir: "ltr",
    background_color: "#111219", // = --background do tema ESCURO (splash escura, sem branco)
    theme_color: "#4b58be", // ≈ --primary (índigo profundo)
    categories: ["productivity", "business", "utilities"],
    prefer_related_applications: false,
    related_applications: origin
      ? [{ platform: "webapp", url: `${origin}/manifest.webmanifest` }]
      : [],
    icons: [
      // "any" → cantos levemente arredondados (splash/navegador)
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      // "maskable" → full-bleed (o launcher do Android mascara sozinho)
      { src: "/icons/maskable/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
