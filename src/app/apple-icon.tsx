import { ImageResponse } from "next/og";
import { markArt } from "@/lib/brand-icon";

// apple-touch-icon (iOS "Adicionar à Tela de Início"). 180x180 é o tamanho recomendado; o iOS
// arredonda sozinho, então a arte é full-bleed (ver lib/brand-icon). Next injeta o <link> no <head>.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(markArt(size.width), { ...size });
}
