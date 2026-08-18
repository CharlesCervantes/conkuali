import { redirect } from "next/navigation";

// /contrato (sin subpestaña) no tiene vista propia — manda a la subpestaña
// por defecto. La pestaña principal "Contrato" enlaza aquí a propósito (no
// directo a /contrato/general) para que el resaltado activo por prefijo
// cubra tanto General como Privado (ver [id]/layout.tsx, TabNav).
export default async function ContratoIndexPage({
  params,
}: PageProps<"/control-de-obra/[id]/contrato">) {
  const { id } = await params;
  redirect(`/control-de-obra/${id}/contrato/general`);
}
