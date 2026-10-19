import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 exige declarar explícitamente qué valores de `quality` puede
  // pedir un <Image> — sin esto, quality={95} en la foto del login (hero,
  // app/login/page.tsx) sería rechazado en tiempo de request ("q" parameter
  // (quality) of 95 is not allowed). 75 se conserva porque es el default que
  // ya usa implícitamente el resto de <Image> del proyecto (ninguna otra
  // pantalla pasa `quality` explícito) — no se les cambia nada.
  images: {
    qualities: [75, 95],
  },
  // pdf-parse (y pdfjs-dist, su dependencia) resuelven su worker con una ruta
  // relativa a su propio archivo en node_modules — al dejar que Next empaque
  // ese código en un chunk de servidor, esa ruta deja de existir y el "fake
  // worker" de pdfjs-dist falla en tiempo de ejecución. @napi-rs/canvas (usado
  // por pdfjs-dist para renderizar páginas a imagen — estrategia VISION,
  // V1.2) tiene el mismo problema: su loader de binario nativo (.node) no es
  // "placeable" en un chunk ESM de Turbopack. Excluirlos del bundling
  // (require nativo de Node) es la solución documentada por Next para
  // dependencias con necesidades específicas de Node.js.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // Carga inteligente de documentos permite hasta 5 PDFs de 10MB cada uno en
  // un mismo lote (lib/server/contabilidad/documentos/documento-egreso.ts) —
  // el límite default de Server Actions (1MB) los rechazaría antes de llegar
  // a esa validación.
  experimental: {
    serverActions: {
      bodySizeLimit: "55mb",
    },
  },
  // Compatibilidad con bookmarks/links viejos tras reorganizar la navegación
  // de Control de Obra en áreas (Contrato/Ejecución) — agosto 2026. No
  // permanentes (307): si el URL de las nuevas áreas cambia otra vez más
  // adelante, no queremos que el navegador/CDN cachee esto para siempre.
  async redirects() {
    return [
      {
        source: "/control-de-obra/:id/partidas",
        destination: "/control-de-obra/:id/contrato/general",
        permanent: false,
      },
      {
        source: "/control-de-obra/:id/contrato-privado",
        destination: "/control-de-obra/:id/contrato/privado",
        permanent: false,
      },
      {
        source: "/control-de-obra/:id/avance",
        destination: "/control-de-obra/:id/ejecucion/avance",
        permanent: false,
      },
      {
        source: "/control-de-obra/:id/contratistas",
        destination: "/control-de-obra/:id/ejecucion/contratistas",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
