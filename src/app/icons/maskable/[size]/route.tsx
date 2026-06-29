import { ImageResponse } from "next/og";
import { markArt } from "@/lib/brand-icon";

// Ícones MASKABLE do manifesto: /icons/maskable/192 e /512. FULL-BLEED (sem arredondar) — o launcher
// do Android aplica a própria máscara (círculo/squircle/etc). Pré-gerados estáticos no build.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const n = Number(size);
  return new ImageResponse(markArt(n), { width: n, height: n });
}
