// Backfill de la migración "estimacion_cliente_capas" (arquitectura por
// capas — Cliente/Cliente Priv. como documentos financieros independientes,
// agosto 2026). Ejecutar UNA vez, después de aplicar la migración aditiva
// 20260827180000_estimacion_cliente_capas: npx tsx prisma/backfills/20260827-estimacion-cliente-capas.ts
//
// Idempotente: si una EstimacionCliente ya tiene filas EstimacionClienteCapa,
// se omite — puede volver a correrse sin duplicar nada.
//
// Regla central (aprobada explícitamente): un snapshot monetario
// materializado (EstimacionClienteCapaConcepto / EstimacionClienteGasto)
// NUNCA debe existir para una capa que no está EMITIDA.
// - Legacy EMITIDA -> ambas capas nacen EMITIDA, con su folio histórico
//   duplicado y su propio snapshot materializado desde las columnas
//   Operativo/Privado que antes vivían en la misma fila.
// - Legacy BORRADOR -> ambas capas nacen BORRADOR, sin numero, sin ningún
//   snapshot — desde ese momento se valorizan en vivo.

import "dotenv/config";
import { PrismaClient } from "../../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const estimaciones = await db.estimacionCliente.findMany({
    include: {
      detalle: true,
      gastos: { include: { detalle: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let omitidasIdempotencia = 0;
  let creadasEmitida = 0;
  let creadasBorrador = 0;
  let conceptosMaterializados = 0;
  let gastosDuplicados = 0;
  let gastosReclamadosAmbasCapas = 0;
  let movimientosReasignados = 0;

  for (const est of estimaciones) {
    const yaExiste = await db.estimacionClienteCapa.findFirst({
      where: { estimacionClienteId: est.id },
      select: { id: true },
    });
    if (yaExiste) {
      omitidasIdempotencia++;
      continue;
    }

    const esEmitida = est.estatus === "EMITIDA";

    await db.$transaction(async (tx) => {
      const capaOperativo = await tx.estimacionClienteCapa.create({
        data: {
          estimacionClienteId: est.id,
          capa: "OPERATIVO",
          estatus: esEmitida ? "EMITIDA" : "BORRADOR",
          aplicaIVA: est.aplicaIVA,
          porcentajeIVA: est.porcentajeIVA,
          generadoPorId: est.generadoPorId,
          generadoEn: est.generadoEn,
          ...(esEmitida
            ? {
                numero: est.numero,
                subtotal: est.subtotalOperativo,
                montoAdministracionTrabajos: est.montoAdministracionTrabajosOperativo,
                subtotalGastosCobrables: est.subtotalGastosCobrables,
                porcentajeAdministracionGastos: est.porcentajeAdministracionGastosOperativo,
                montoAdministracionGastos: est.montoAdministracionGastosOperativo,
                montoIVA: est.montoIVAOperativo,
                total: est.totalOperativo,
                emitidoPorId: est.emitidoPorId,
                emitidoEn: est.emitidoEn,
                fechaCorteDocumento: est.fechaCorteDocumento,
                montoContratoCongelado: est.montoContratoOperativoCongelado,
              }
            : {}),
        },
      });

      const capaPrivado = await tx.estimacionClienteCapa.create({
        data: {
          estimacionClienteId: est.id,
          capa: "PRIVADO",
          estatus: esEmitida ? "EMITIDA" : "BORRADOR",
          aplicaIVA: est.aplicaIVA,
          porcentajeIVA: est.porcentajeIVA,
          generadoPorId: est.generadoPorId,
          generadoEn: est.generadoEn,
          ...(esEmitida
            ? {
                numero: est.numero,
                subtotal: est.subtotal!,
                montoAdministracionTrabajos: est.montoAdministracionOUtilidad!,
                subtotalGastosCobrables: est.subtotalGastosCobrables,
                porcentajeAdministracionGastos: est.porcentajeAdministracionGastosPrivado,
                montoAdministracionGastos: est.montoAdministracionGastosPrivado,
                montoIVA: est.montoIVA,
                total: est.total!,
                emitidoPorId: est.emitidoPorId,
                emitidoEn: est.emitidoEn,
                fechaCorteDocumento: est.fechaCorteDocumento,
                montoContratoCongelado: est.montoContratoPrivadoCongelado,
              }
            : {}),
        },
      });

      if (!esEmitida) {
        creadasBorrador++;
        return;
      }
      creadasEmitida++;

      for (const concepto of est.detalle) {
        if (concepto.precioUnitarioOperativo != null) {
          await tx.estimacionClienteCapaConcepto.create({
            data: {
              estimacionClienteCapaId: capaOperativo.id,
              conceptoId: concepto.conceptoId,
              precioUnitarioBase: concepto.precioUnitarioOperativo,
              porcentajeAplicado: null,
              precioUnitario: concepto.precioUnitarioOperativo,
              importeContratado: concepto.importeContratadoOperativo!,
              importeEstaSemana: concepto.importeEstaSemanaOperativo!,
              importeAcumulado: concepto.importeAcumuladoOperativo!,
              importePorEjercer: concepto.importePorEjercerOperativo!,
            },
          });
          conceptosMaterializados++;
        }
        if (concepto.precioUnitarioPrivado != null) {
          await tx.estimacionClienteCapaConcepto.create({
            data: {
              estimacionClienteCapaId: capaPrivado.id,
              conceptoId: concepto.conceptoId,
              precioUnitarioBase: concepto.precioUnitarioPrivado,
              porcentajeAplicado: concepto.porcentajeAplicadoPrivado,
              precioUnitario: concepto.precioUnitarioPrivado,
              importeContratado: concepto.importeContratadoPrivado!,
              importeEstaSemana: concepto.importeEstaSemanaPrivado!,
              importeAcumulado: concepto.importeAcumuladoPrivado!,
              importePorEjercer: concepto.importePorEjercerPrivado!,
            },
          });
          conceptosMaterializados++;
        }
      }

      for (const gasto of est.gastos) {
        // Reutiliza la fila existente para PRIVADO (conserva su id); crea
        // una copia nueva, con el mismo monto/detalle histórico, para
        // OPERATIVO.
        await tx.estimacionClienteGasto.update({
          where: { id: gasto.id },
          data: { estimacionClienteCapaId: capaPrivado.id },
        });

        const copia = await tx.estimacionClienteGasto.create({
          data: {
            estimacionClienteId: est.id,
            estimacionClienteCapaId: capaOperativo.id,
            gastoObraId: gasto.gastoObraId,
            fecha: gasto.fecha,
            descripcion: gasto.descripcion,
            categoria: gasto.categoria,
            monto: gasto.monto,
          },
        });
        for (const linea of gasto.detalle) {
          await tx.estimacionClienteGastoDetalle.create({
            data: {
              estimacionClienteGastoId: copia.id,
              descripcion: linea.descripcion,
              unidad: linea.unidad,
              cantidad: linea.cantidad,
              precioUnitario: linea.precioUnitario,
            },
          });
        }
        gastosDuplicados++;

        await tx.gastoObra.update({
          where: { id: gasto.gastoObraId },
          data: {
            incluidoEnCapaOperativoId: capaOperativo.id,
            incluidoEnCapaPrivadoId: capaPrivado.id,
          },
        });
        gastosReclamadosAmbasCapas++;
      }

      const movimientos = await tx.movimientoFinancieroCliente.updateMany({
        where: { estimacionClienteId: est.id },
        data: { estimacionClienteCapaId: capaPrivado.id },
      });
      movimientosReasignados += movimientos.count;
    });
  }

  const proyectos = await db.proyecto.findMany({
    select: { id: true, ultimoNumeroEstimacion: true },
  });
  for (const p of proyectos) {
    await db.proyecto.update({
      where: { id: p.id },
      data: {
        ultimoNumeroEstimacionOperativo: p.ultimoNumeroEstimacion,
        ultimoNumeroEstimacionPrivado: p.ultimoNumeroEstimacion,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        totalEstimaciones: estimaciones.length,
        omitidasIdempotencia,
        creadasEmitida,
        creadasBorrador,
        conceptosMaterializados,
        gastosDuplicados,
        gastosReclamadosAmbasCapas,
        movimientosReasignados,
        proyectosActualizados: proyectos.length,
      },
      null,
      2
    )
  );

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
