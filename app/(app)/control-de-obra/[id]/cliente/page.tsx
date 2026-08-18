import { redirect } from "next/navigation";

// /cliente (sin subpestaña) no tiene vista propia — manda a la subpestaña
// por defecto. La pestaña principal "Cliente" enlaza aquí a propósito (no
// directo a /cliente/general) para que el resaltado activo por prefijo cubra
// tanto Cliente como Cliente Priv. (ver [id]/layout.tsx, TabNav) — mismo
// patrón que /contrato y /ejecucion.
export default async function ClienteIndexPage({
  params,
}: PageProps<"/control-de-obra/[id]/cliente">) {
  const { id } = await params;
  redirect(`/control-de-obra/${id}/cliente/general`);
}
