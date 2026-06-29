// Arte da marca para os ícones gerados (favicon / apple-icon / ícones do manifesto), renderizada
// pelo ImageResponse (next/og → Satori) em tempo de build. Espelha o BrandMark do shell:
// quadrado índigo (gradiente) + microfone branco. FULL-BLEED de propósito (sem cantos arredondados):
// serve como `maskable` (Android recorta) e como apple-icon (iOS arredonda sozinho). Cores em HEX
// (Satori não garante OKLCH); equivalem a --primary (#4b58be) → índigo profundo (#3a1b83).
// É um SÍMBOLO (não o nome escrito) → sobrevive a uma troca de nome sem regerar nada (Questão #2).
//
// IMPORTANTE (Satori): NÃO usar <svg> aninhado com stroke — o Satori o rende como um retângulo cheio.
// O caminho confiável é embutir o microfone como <img> com data-URI SVG (Satori rasteriza o data-URI).
function micDataUri(px: number) {
  // stroke-width fica em unidades do viewBox (0 0 24 24); o SVG escala junto com width/height.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">` +
    `<rect x="9" y="2" width="6" height="11" rx="3"/>` +
    `<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>` +
    `<line x1="12" x2="12" y1="19" y2="22"/>` +
    `<line x1="8" x2="16" y1="22" y2="22"/>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// `rounded`: cantos levemente arredondados (≈14%) para os ícones "any" (favicon, splash, navegador).
// Para `maskable` use rounded=false (full-bleed) — o launcher do Android aplica a própria máscara;
// arredondar antes deixaria folga dentro da máscara. (apple-icon também fica full-bleed: o iOS arredonda.)
export function markArt(size: number, opts?: { rounded?: boolean }) {
  const glyph = Math.round(size * 0.56);
  const radius = opts?.rounded ? Math.round(size * 0.14) : 0;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius,
        background: "linear-gradient(135deg, #4b58be 0%, #3a1b83 100%)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img width={glyph} height={glyph} src={micDataUri(glyph)} alt="" />
    </div>
  );
}
