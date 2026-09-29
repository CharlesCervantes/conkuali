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
