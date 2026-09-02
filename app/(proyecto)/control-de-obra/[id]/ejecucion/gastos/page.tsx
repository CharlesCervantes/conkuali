import { redirect } from "next/navigation";

// /ejecucion/gastos (sin subpestaña) no tiene vista propia — manda a la
// subpestaña por defecto. La pestaña principal "Gastos" enlaza aquí a
// propósito (no directo a /reposiciones) para que el resaltado activo por
// prefijo cubra tanto Reposiciones como Órdenes de compra.
export default async function GastosIndexPage({
  params,
}: PageProps<"/control-de-obra/[id]/ejecucion/gastos">) {
  const { id } = await params;
  redirect(`/control-de-obra/${id}/ejecucion/gastos/reposiciones`);
}
