import { notFound } from "next/navigation";
import { requireSession } from "@/lib/server/auth/dal";
import {
  obtenerEmpresa,
  listarPlanesCatalogo,
  EmpresaNoEncontradaError,
} from "@/lib/server/master/empresas";
import { EmpresaDetalleView } from "@/components/master/empresa-detalle-view";

export default async function MasterEmpresaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await requireSession();
  const { id } = await params;

  let empresa;
  try {
    empresa = await obtenerEmpresa(usuario, id);
  } catch (error) {
    if (error instanceof EmpresaNoEncontradaError) notFound();
    throw error;
  }
  const planes = await listarPlanesCatalogo(usuario);

  return <EmpresaDetalleView empresa={empresa} planes={planes} />;
}
