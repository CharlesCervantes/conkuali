import type { Metadata } from "next";

// Metadata propia de /login (nunca "Conkuali", el layout raíz) — esta
// pantalla es pública y usa la marca de plataforma Arqento, distinta del
// nombre del tenant (Rediseño de login, septiembre 2026).
export const metadata: Metadata = {
  title: "Arqento",
  description: "Plataforma de gestión de proyectos",
};

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return children;
}
