import { redirect } from "next/navigation";

// /cliente/privado (sin subpestaña) no tiene vista propia — manda a la
// subpestaña por defecto. La pestaña "Cliente Priv." (en cliente/layout.tsx)
// enlaza aquí a propósito (no directo a /estimacion) para que el resaltado
// activo por prefijo cubra tanto Estimación semanal como Control Contractual
// — mismo patrón que /contrato, /ejecucion y /cliente.
export default async function ClientePrivadoIndexPage({
  params,
}: PageProps<"/control-de-obra/[id]/cliente/privado">) {
  const { id } = await params;
  redirect(`/control-de-obra/${id}/cliente/privado/estimacion`);
}
