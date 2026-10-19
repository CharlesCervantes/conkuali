import type { Prisma } from "@/lib/generated/prisma/client";

// Política de acceso por capa para dinero de cliente en Contabilidad
// (docs/negocio/05-modulo-contabilidad.md, sección 17): sin acceso Privado
// solo son visibles los MovimientoFinancieroCliente sin capa (aportaciones
// de fondo) o ligados a una capa OPERATIVO — nunca uno ligado a la capa
// PRIVADO, ni como fila ni como conteo. Mismo criterio que ya aplica la
// lista de Ingresos (ingresos.ts); aquí vive en un solo lugar para las
// consultas de facturas.
export function filtroMovimientoClienteVisible(incluirPrivado: boolean): Prisma.MovimientoFinancieroClienteWhereInput {
  if (incluirPrivado) return {};
  return { OR: [{ estimacionClienteCapaId: null }, { estimacionClienteCapa: { capa: "OPERATIVO" } }] };
}
