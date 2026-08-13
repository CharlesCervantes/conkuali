import "server-only";
import { db } from "@/lib/server/db";
import type { AccionAuditoria } from "@/lib/generated/prisma/enums";

// Json de Prisma solo acepta valores JSON planos — las fechas (Date) hay que
// pasarlas por JSON.stringify/parse para que se conviertan a ISO string, igual
// que cualquier otro tipo no serializable directamente (Decimal, etc.).
function aJson(valor: Record<string, unknown> | null | undefined) {
  if (!valor) return undefined;
  return JSON.parse(JSON.stringify(valor));
}

export async function registrarAuditoria(params: {
  empresaId?: string | null;
  usuarioId: string;
  entidad: string;
  entidadId: string;
  accion: AccionAuditoria;
  valorAnterior?: Record<string, unknown> | null;
  valorNuevo?: Record<string, unknown> | null;
}) {
  await db.registroAuditoria.create({
    data: {
      empresaId: params.empresaId ?? null,
      usuarioId: params.usuarioId,
      entidad: params.entidad,
      entidadId: params.entidadId,
      accion: params.accion,
      valorAnterior: aJson(params.valorAnterior),
      valorNuevo: aJson(params.valorNuevo),
    },
  });
}
