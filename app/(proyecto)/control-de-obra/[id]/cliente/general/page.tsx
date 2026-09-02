import { redirect } from "next/navigation";

// /cliente/general (sin subpestaña) no tiene vista propia — manda a la
// subpestaña por defecto. El ítem "Cliente" del sidebar de proyecto enlaza
// aquí a propósito (no directo a /estimacion) para que el resaltado activo
// por prefijo cubra tanto Estimación semanal como Control contractual —
// mismo patrón que /cliente/privado (rediseño Cliente/Cliente Priv., agosto
// 2026: Control contractual deja de ser exclusivo de la capa privada).
export default async function ClienteGeneralIndexPage({
  params,
}: PageProps<"/control-de-obra/[id]/cliente/general">) {
  const { id } = await params;
  redirect(`/control-de-obra/${id}/cliente/general/estimacion`);
}
