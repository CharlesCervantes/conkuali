import "server-only";
import type { UsuarioSesion } from "@/lib/server/session";
import { calcularEstadoResultados } from "./estado-resultados";

// Adaptador delgado sobre el motor de Estado de Resultados (Contabilidad —
// reconocimiento, septiembre 2026) — mantiene el mismo nombre/firma/forma de
// retorno que el resumen fiscal original para no romper a su único
// consumidor externo (lib/server/dashboard.ts, Inicio). El cálculo interno
// ahora es el correcto (reconocimiento por eje 2, respeta inclusión
// contable e información Privada) en vez del criterio anterior
// (requiereFactura + suma indiscriminada de MovimientoFinancieroCliente).
// Ver docs/negocio/05-modulo-contabilidad.md.

export type ResumenFiscalPeriodo = {
  ingresosFiscales: number;
  egresosFiscales: number;
  resultado: number;
};

export async function obtenerResumenFiscalPeriodo(
  usuario: UsuarioSesion,
  desde: Date,
  hasta: Date
): Promise<ResumenFiscalPeriodo> {
  const estado = await calcularEstadoResultados(usuario, { desde, hasta, etiqueta: "" }, null);
  const ingresosFiscales = estado.ingresos.total;
  const egresosFiscales = estado.costosDirectos.total + estado.gastosOperacion.total + estado.impuestosContribuciones;
  return { ingresosFiscales, egresosFiscales, resultado: ingresosFiscales - egresosFiscales };
}
