import "server-only";
import { db } from "@/lib/server/db";
import { sumarMontos } from "@/lib/dinero";
import type {
  EstatusAprobacion,
  EstatusPago,
} from "@/lib/generated/prisma/enums";

export type FilaContratista = {
  id: string; // beneficiarioProyectoId
  nombre: string;
  concepto: string | null;
  montoContrato: number;
  aditivasAutorizadas: number;
  montoContractualVigente: number;
  pagadoHistorico: number;
  saldo: number;
  montoEntreSemana: number;
  montoFinSemana: number;
  estatusAprobacion: EstatusAprobacion | null;
  estatusPago: EstatusPago | null;
};

export type FilaProveedor = {
  id: string;
  nombre: string;
  giro: string | null;
  montoEntreSemana: number;
  montoFinSemana: number;
  estatusAprobacion: EstatusAprobacion | null;
  estatusPago: EstatusPago | null;
};

export type FilaAdministracion = {
  id: string;
  nombre: string;
  puesto: string | null;
  montoEntreSemana: number;
  montoFinSemana: number;
  estatusAprobacion: EstatusAprobacion | null;
  estatusPago: EstatusPago | null;
};

export type ReporteObra = {
  proyecto: {
    id: string;
    nombre: string;
    tipo: string;
    estatus: string;
  };
  contratistas: FilaContratista[];
  proveedores: FilaProveedor[];
  administracion: FilaAdministracion[];
  totalEntreSemana: number;
  totalFinSemana: number;
  totalSemana: number;
  // Suma de los movimientos en estatusPago PENDIENTE_PAGO (dinero que falta
  // por pagar esta semana; no incluye lo ya cubierto por fondo puente).
  pendienteSemana: number;
};

export async function obtenerReporteSemana(
  empresaId: string,
  semanaId: string
): Promise<ReporteObra[]> {
  const [proyectos, pagosHistoricos] = await Promise.all([
    db.proyecto.findMany({
      where: { empresaId, estatus: { in: ["ACTIVO", "PAUSADO"] } },
      orderBy: { nombre: "asc" },
      include: {
        beneficiarios: {
          where: { activo: true },
          orderBy: { beneficiario: { nombre: "asc" } },
          include: {
            beneficiario: { include: { proveedor: true } },
            movimientos: { where: { semanaId } },
            aditivas: { where: { estatus: "AUTORIZADA" } },
          },
        },
      },
    }),
    db.movimientoSemanal.groupBy({
      by: ["beneficiarioProyectoId"],
      where: {
        beneficiarioProyecto: { proyecto: { empresaId } },
        estatusAprobacion: "APROBADO",
      },
      _sum: { montoEntreSemana: true, montoFinSemana: true },
    }),
  ]);

  const pagadoPorParticipacion = new Map<string, number>();
  for (const fila of pagosHistoricos) {
    pagadoPorParticipacion.set(
      fila.beneficiarioProyectoId,
      sumarMontos(fila._sum.montoEntreSemana, fila._sum.montoFinSemana)
    );
  }

  return proyectos.map((proyecto) => {
    const contratistas: FilaContratista[] = [];
    const proveedores: FilaProveedor[] = [];
    const administracion: FilaAdministracion[] = [];

    for (const bp of proyecto.beneficiarios) {
      const movimiento = bp.movimientos[0] ?? null;
      const montoEntreSemana = movimiento
        ? Number(movimiento.montoEntreSemana)
        : 0;
      const montoFinSemana = movimiento ? Number(movimiento.montoFinSemana) : 0;
      const estatusAprobacion = movimiento?.estatusAprobacion ?? null;
      const estatusPago = movimiento?.estatusPago ?? null;

      if (bp.beneficiario.tipo === "CONTRATISTA") {
        const montoContrato = Number(bp.montoContrato ?? 0);
        const aditivasAutorizadas = sumarMontos(
          ...bp.aditivas.map((a) => a.monto)
        );
        const montoContractualVigente = montoContrato + aditivasAutorizadas;
        const pagadoHistorico = pagadoPorParticipacion.get(bp.id) ?? 0;

        contratistas.push({
          id: bp.id,
          nombre: bp.beneficiario.nombre,
          concepto: bp.concepto,
          montoContrato,
          aditivasAutorizadas,
          montoContractualVigente,
          pagadoHistorico,
          saldo: montoContractualVigente - pagadoHistorico,
          montoEntreSemana,
          montoFinSemana,
          estatusAprobacion,
          estatusPago,
        });
      } else if (bp.beneficiario.tipo === "PROVEEDOR") {
        proveedores.push({
          id: bp.id,
          nombre: bp.beneficiario.nombre,
          giro: bp.beneficiario.proveedor?.giro ?? null,
          montoEntreSemana,
          montoFinSemana,
          estatusAprobacion,
          estatusPago,
        });
      } else {
        administracion.push({
          id: bp.id,
          nombre: bp.beneficiario.nombre,
          puesto: bp.puesto,
          montoEntreSemana,
          montoFinSemana,
          estatusAprobacion,
          estatusPago,
        });
      }
    }

    const totalEntreSemana =
      sumaAprobadaPorGrupo(contratistas, "montoEntreSemana") +
      sumaAprobadaPorGrupo(proveedores, "montoEntreSemana") +
      sumaAprobadaPorGrupo(administracion, "montoEntreSemana");
    const totalFinSemana =
      sumaAprobadaPorGrupo(contratistas, "montoFinSemana") +
      sumaAprobadaPorGrupo(proveedores, "montoFinSemana") +
      sumaAprobadaPorGrupo(administracion, "montoFinSemana");
    const pendienteSemana =
      sumaPendientePorGrupo(contratistas) +
      sumaPendientePorGrupo(proveedores) +
      sumaPendientePorGrupo(administracion);

    return {
      proyecto: {
        id: proyecto.id,
        nombre: proyecto.nombre,
        tipo: proyecto.tipo,
        estatus: proyecto.estatus,
      },
      contratistas,
      proveedores,
      administracion,
      totalEntreSemana,
      totalFinSemana,
      totalSemana: totalEntreSemana + totalFinSemana,
      pendienteSemana,
    };
  });
}

// Solo los movimientos ya Aprobados cuentan en los totales oficiales
// (docs/negocio/03-modulo-reporte-general.md, sección 2.6).
function sumaAprobadaPorGrupo<
  T extends {
    montoEntreSemana: number;
    montoFinSemana: number;
    estatusAprobacion: EstatusAprobacion | null;
  }
>(filas: T[], campo: "montoEntreSemana" | "montoFinSemana"): number {
  return filas
    .filter((f) => f.estatusAprobacion === "APROBADO")
    .reduce((total, f) => total + f[campo], 0);
}

// Dinero aprobado que todavía no se paga (estatusPago = PENDIENTE_PAGO). No
// incluye lo cubierto por fondo puente, que ya se considera pagado al
// beneficiario aunque la empresa deba reponer el fondo.
function sumaPendientePorGrupo<
  T extends {
    montoEntreSemana: number;
    montoFinSemana: number;
    estatusAprobacion: EstatusAprobacion | null;
    estatusPago: EstatusPago | null;
  }
>(filas: T[]): number {
  return filas
    .filter(
      (f) => f.estatusAprobacion === "APROBADO" && f.estatusPago === "PENDIENTE_PAGO"
    )
    .reduce((total, f) => total + f.montoEntreSemana + f.montoFinSemana, 0);
}
