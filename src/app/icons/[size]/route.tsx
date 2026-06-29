import { ImageResponse } from "next/og";
import { markArt } from "@/lib/brand-icon";

// Ícones "any" do MANIFESTO (instalável): /icons/192 e /icons/512, referenciados em app/manifest.ts.
// Cantos levemente arredondados (rounded). A variante maskable (full-bleed) fica em icons/maskable/.
// URLs estáveis (ao contrário do hash do icon.tsx), então dá para cravá-las no manifesto. Pré-gerados
// estáticos no build (force-static + dynamicParams=false → só 192/512).
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const n = Number(size);
  return new ImageResponse(markArt(n, { rounded: true }), { width: n, height: n });
}
