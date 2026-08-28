import { redirect } from "next/navigation";

// /ejecucion (sin subpestaña) no tiene vista propia — manda a la subpestaña
// por defecto. La pestaña principal "Ejecución" enlaza aquí a propósito (no
// directo a /ejecucion/avance) para que el resaltado activo por prefijo
// cubra tanto Avance de obra como Contratistas (ver [id]/layout.tsx, TabNav).
export default async function EjecucionIndexPage({
  params,
}: PageProps<"/control-de-obra/[id]/ejecucion">) {
  const { id } = await params;
  redirect(`/control-de-obra/${id}/ejecucion/avance`);
}
