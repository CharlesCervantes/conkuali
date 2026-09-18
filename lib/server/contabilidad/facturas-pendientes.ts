import "server-only";
import { db } from "@/lib/server/db";
import { puedeVerContabilidad } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError } from "@/lib/server/control-de-obra/proyectos";
import { EMPRESA_PROYECTO_LABEL } from "@/lib/server/control-de-obra/proyecto-oficina";

// "Factura pendiente" NUNCA depende de que exista un Egreso/Ingreso
// materializado — se deriva directamente de GastoObra.requiereFactura (igual
// criterio que calcularEstatusFiscal, lib/server/control-de-obra/gastos.ts)
// e Ingreso.facturaEsperada. Confirmado explícitamente así (Contabilidad,
// septiembre 2026).

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

export type FilaFacturaPendiente = {
  id: string;
  origen: "EGRESO" | "INGRESO";
  fecha: string;
  concepto: string;
  proyectoNombre: string | null;
  montoEsperado: number;
};

export async function obtenerFacturasPendientes(usuario: UsuarioSesion): Promise<FilaFacturaPendiente[]> {
  const empresaId = requerirContabilidad(usuario);

  const [gastos, ingresos] = await Promise.all([
    db.gastoObra.findMany({
      where: { empresaId, estatus: "APROBADO", requiereFactura: true, facturaRef: null },
      include: { proyecto: { select: { nombre: true, tipo: true } } },
      orderBy: { fecha: "desc" },
    }),
    db.ingreso.findMany({
      where: {
        empresaId,
        facturaEsperada: true,
        facturaId: null,
        estatus: "VIGENTE",
        OR: [{ movimientoFinancieroClienteId: null }, { movimientoFinancieroCliente: { estatus: "VIGENTE" } }],
      },
      include: {
        proyecto: { select: { nombre: true, tipo: true } },
        movimientoFinancieroCliente: {
          select: { monto: true, fecha: true, proyecto: { select: { nombre: true, tipo: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const filasEgreso: FilaFacturaPendiente[] = gastos.map((g) => ({
    id: g.id,
    origen: "EGRESO",
    fecha: g.fecha.toISOString(),
    concepto: g.descripcion,
    proyectoNombre: g.proyecto.tipo === "OFICINA" ? EMPRESA_PROYECTO_LABEL : g.proyecto.nombre,
    montoEsperado: Number(g.monto),
  }));

  const filasIngreso: FilaFacturaPendiente[] = ingresos.map((i) => {
    const proyecto = i.movimientoFinancieroCliente?.proyecto ?? i.proyecto;
    const monto = i.movimientoFinancieroCliente ? Number(i.movimientoFinancieroCliente.monto) : Number(i.monto ?? 0);
    const fecha = i.movimientoFinancieroCliente?.fecha ?? i.fecha ?? i.createdAt;
    return {
      id: i.id,
      origen: "INGRESO",
      fecha: fecha.toISOString(),
      concepto: i.concepto ?? i.clienteNombre ?? "Ingreso",
      proyectoNombre: proyecto ? (proyecto.tipo === "OFICINA" ? EMPRESA_PROYECTO_LABEL : proyecto.nombre) : null,
      montoEsperado: monto,
    };
  });

  return [...filasEgreso, ...filasIngreso].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}
