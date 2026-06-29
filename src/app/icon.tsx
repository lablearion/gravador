import { ImageResponse } from "next/og";
import { markArt } from "@/lib/brand-icon";

// Ícone do navegador (aba/favicon) gerado por código — substitui o favicon padrão do scaffold.
// Estático (gerado no build e cacheado). Fonte do desenho: lib/brand-icon (mesma marca do shell).
export const size = { width: 256, height: 256 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(markArt(size.width, { rounded: true }), { ...size });
}
