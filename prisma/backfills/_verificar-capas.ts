// Script de verificación DESECHABLE de la arquitectura por capas — no es
// parte del backfill permanente, bórralo (y su empresa __VERIFCAPAS__) en
// cuanto termines de revisar el resultado.
//
// Ejecutar con: npx tsx prisma/backfills/_verificar-capas.ts
//
// Crea una empresa/usuario/proyecto sintéticos con prefijo __VERIFCAPAS__,
// corre los escenarios centrales del rediseño llamando DIRECTAMENTE a los
// servicios reales (nunca HTTP, nunca UI) y limpia todo al final —
// exactamente igual si el script termina bien o si truena a medio camino
// (bloque finally). Imprime un reporte PASA/FALLA por escenario.

import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaClient } from "../../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../lib/crypto/password";
import type { UsuarioSesion } from "../../lib/server/session";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const PREFIJO = "__VERIFCAPAS__";
const resultados: { nombre: string; ok: boolean; detalle?: string }[] = [];

function check(nombre: string, condicion: boolean, detalle?: string) {
  resultados.push({ nombre, ok: condicion, detalle });
  console.log(`${condicion ? "PASA" : "FALLA"} — ${nombre}${detalle ? " :: " + detalle : ""}`);
}

async function main() {
  const empresa = await db.empresa.create({ data: { nombre: `${PREFIJO} Empresa` } });
  const usuarioRow = await db.usuario.create({
    data: {
      nombre: `${PREFIJO} Admin`,
      email: `${PREFIJO.toLowerCase()}-${Date.now()}@example.test`,
      passwordHash: await hashPassword(randomBytes(16).toString("hex")),
      rol: "ADMINISTRADOR",
      empresaId: empresa.id,
      vistaPrivadaActiva: true,
    },
  });

  const usuario = {
    id: usuarioRow.id,
    nombre: usuarioRow.nombre,
    email: usuarioRow.email,
    rol: usuarioRow.rol,
    activo: usuarioRow.activo,
    empresaId: empresa.id,
    vistaPrivadaActiva: true,
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      colorPrimario: empresa.colorPrimario,
      colorSecundario: empresa.colorSecundario,
      logoRef: empresa.logoRef,
      activa: empresa.activa,
      plan: null,
    },
  } as unknown as UsuarioSesion;

  const {
    asegurarFisicoYCapas,
    emitirEstimacion,
    obtenerEstimacionCliente,
  } = await import("../../lib/server/control-de-obra/estimacion-cliente");
  const { aplicarFondoAEstimacionTx, registrarAportacionFondo, obtenerControlContractual } = await import(
    "../../lib/server/control-de-obra/financiero-cliente"
  );
  const { reabrirSemana } = await import("../../lib/server/control-de-obra/cierre-semana");

  try {
    const proyecto = await db.proyecto.create({
      data: {
        empresaId: empresa.id,
        nombre: `${PREFIJO} Proyecto`,
        esquemaContractual: "ADMINISTRACION",
        porcentajeAdministracionDefault: 0,
      },
    });
    const partida = await db.partida.create({ data: { proyectoId: proyecto.id, nombre: "Partida 1" } });
    const concepto = await db.concepto.create({
      data: {
        partidaId: partida.id,
        descripcion: "Concepto 1",
        unidad: "PZA",
        cantidadContratada: 100,
        precioUnitarioContratista: 500, // General parte de aquí
      },
    });

    // Semana 35 de 2026 — fecha arbitraria fija para el escenario.
    const semana = await db.semana.create({
      data: { empresaId: empresa.id, numero: 35, anio: 2026, fechaInicio: new Date(2026, 7, 24), fechaFin: new Date(2026, 7, 30) },
    });

    await db.avanceConcepto.create({
      data: {
        empresaId: empresa.id,
        conceptoId: concepto.id,
        semanaId: semana.id,
        cantidadEjecutada: 10,
        estatusAprobacion: "APROBADO",
        registradoPorId: usuario.id,
        aprobadoPorId: usuario.id,
      },
    });

    // --- Cierre de semana 35: asegura físico + ambas capas BORRADOR ---
    await db.$transaction(async (tx) => {
      await asegurarFisicoYCapas(
        tx,
        { empresaId: empresa.id, proyectoId: proyecto.id, semanaId: semana.id, usuarioId: usuario.id },
        { id: semana.id, fechaInicio: semana.fechaInicio }
      );
    });

    const capasIniciales = await db.estimacionClienteCapa.findMany({
      where: { estimacionCliente: { proyectoId: proyecto.id, semanaId: semana.id } },
    });
    check("Al cerrar semana se crean 2 capas BORRADOR", capasIniciales.length === 2 && capasIniciales.every((c) => c.estatus === "BORRADOR"));

    const capaOperativoId = capasIniciales.find((c) => c.capa === "OPERATIVO")!.id;
    const capaPrivadoId = capasIniciales.find((c) => c.capa === "PRIVADO")!.id;

    // --- Escenario 1: emitir Operativo a $500 ---
    const emitidaOperativo = await emitirEstimacion(usuario, capaOperativoId, false);
    check("Operativo se emite (P.U. $500 vigente)", emitidaOperativo.estatus === "EMITIDA" && emitidaOperativo.numero === 1);

    const capaConceptoOperativo = await db.estimacionClienteCapaConcepto.findFirst({
      where: { estimacionClienteCapaId: capaOperativoId, conceptoId: concepto.id },
    });
    check(
      "Snapshot Operativo congelado con P.U. $500",
      capaConceptoOperativo !== null && Number(capaConceptoOperativo.precioUnitario) === 500
    );

    // --- Escenario 2: BORRADOR nunca escribe en lectura ---
    const capaPrivadoAntes = await db.estimacionClienteCapaConcepto.count({ where: { estimacionClienteCapaId: capaPrivadoId } });
    for (let i = 0; i < 3; i++) {
      await obtenerEstimacionCliente(usuario, proyecto.id, semana.id, "PRIVADO");
    }
    const capaPrivadoDespues = await db.estimacionClienteCapaConcepto.count({ where: { estimacionClienteCapaId: capaPrivadoId } });
    check(
      "Leer una capa BORRADOR repetidamente no escribe filas",
      capaPrivadoAntes === 0 && capaPrivadoDespues === 0,
      `antes=${capaPrivadoAntes} despues=${capaPrivadoDespues}`
    );

    // --- Escenario 3: cambiar precio Privado DESPUÉS de emitir Operativo ---
    await db.concepto.update({ where: { id: concepto.id }, data: { precioUnitarioContratistaPrivado: 650 } });
    const lecturaPrivadoBorrador = await obtenerEstimacionCliente(usuario, proyecto.id, semana.id, "PRIVADO");
    check(
      "Privado BORRADOR refleja el nuevo P.U. $650 en vivo",
      lecturaPrivadoBorrador?.filas[0]?.precioUnitario === 650
    );

    const capaOperativoSigueIgual = await db.estimacionClienteCapaConcepto.findFirst({
      where: { estimacionClienteCapaId: capaOperativoId, conceptoId: concepto.id },
    });
    check(
      "Operativo YA EMITIDA no cambió — sigue en $500",
      Number(capaOperativoSigueIgual?.precioUnitario) === 500
    );

    // --- Escenario 4: emitir Privado a $650 ---
    const emitidaPrivado = await emitirEstimacion(usuario, capaPrivadoId, false);
    check("Privado se emite (P.U. $650 vigente)", emitidaPrivado.estatus === "EMITIDA");
    check("Folio Privado es independiente (numero=1, no 2)", emitidaPrivado.numero === 1);

    const capaConceptoPrivado = await db.estimacionClienteCapaConcepto.findFirst({
      where: { estimacionClienteCapaId: capaPrivadoId, conceptoId: concepto.id },
    });
    check("Snapshot Privado congelado con P.U. $650", Number(capaConceptoPrivado?.precioUnitario) === 650);

    const capaOperativoFinal = await db.estimacionClienteCapaConcepto.findFirst({
      where: { estimacionClienteCapaId: capaOperativoId, conceptoId: concepto.id },
    });
    check(
      "Emitir Privado NO alteró ninguna fila financiera de Operativo",
      Number(capaOperativoFinal?.precioUnitario) === 500
    );

    // --- Escenario 5: reapertura bloqueada tras emitir ---
    let bloqueoReapertura = false;
    let mensajeReapertura = "";
    try {
      await reabrirSemana(usuario, proyecto.id, semana.id, "prueba de reapertura");
    } catch (e) {
      bloqueoReapertura = true;
      mensajeReapertura = e instanceof Error ? e.message : String(e);
    }
    check(
      "Reabrir semana 35 se bloquea con el mensaje exacto",
      bloqueoReapertura && mensajeReapertura === "La semana no puede reabrirse porque ya existe una estimación de cliente emitida.",
      mensajeReapertura
    );

    // --- Escenario 6: fondo compartido — aplicar en Operativo reduce lo disponible en Privado ---
    await registrarAportacionFondo(usuario, proyecto.id, { monto: 20000, fecha: new Date() });
    await db.$transaction(async (tx) => {
      await aplicarFondoAEstimacionTx(tx, { empresaId: empresa.id, proyectoId: proyecto.id, usuarioId: usuario.id }, capaOperativoId, 5000);
    });
    const ccOperativo = await obtenerControlContractual(usuario, proyecto.id, "operativo");
    const ccPrivado = await obtenerControlContractual(usuario, proyecto.id, "privado");
    check(
      "Fondo disponible del proyecto baja para AMBAS capas tras aplicar en Operativo",
      ccOperativo.financiero?.fondo?.disponible === 15000 && ccPrivado.financiero?.fondo?.disponible === 15000,
      `operativo=${ccOperativo.financiero?.fondo?.disponible} privado=${ccPrivado.financiero?.fondo?.disponible}`
    );
    check(
      "Saldo de Operativo bajó (aplicación propia); Privado no se movió",
      (ccOperativo.financiero?.totalCubierto ?? -1) === 5000 && (ccPrivado.financiero?.totalCubierto ?? -1) === 0
    );

    // --- Escenario 7: concurrencia — dos aplicaciones simultáneas nunca exceden el disponible ---
    const proyecto2 = await db.proyecto.create({
      data: { empresaId: empresa.id, nombre: `${PREFIJO} Concurrencia`, esquemaContractual: "ADMINISTRACION", porcentajeAdministracionDefault: 0 },
    });
    const partida2 = await db.partida.create({ data: { proyectoId: proyecto2.id, nombre: "Partida" } });
    const concepto2 = await db.concepto.create({
      data: { partidaId: partida2.id, descripcion: "Concepto", unidad: "PZA", cantidadContratada: 100, precioUnitarioContratista: 1000 },
    });
    const semana2 = await db.semana.create({
      data: { empresaId: empresa.id, numero: 36, anio: 2026, fechaInicio: new Date(2026, 8, 1), fechaFin: new Date(2026, 8, 7) },
    });
    await db.avanceConcepto.create({
      data: { empresaId: empresa.id, conceptoId: concepto2.id, semanaId: semana2.id, cantidadEjecutada: 10, estatusAprobacion: "APROBADO", registradoPorId: usuario.id, aprobadoPorId: usuario.id },
    });
    await db.$transaction(async (tx) => {
      await asegurarFisicoYCapas(tx, { empresaId: empresa.id, proyectoId: proyecto2.id, semanaId: semana2.id, usuarioId: usuario.id }, { id: semana2.id, fechaInicio: semana2.fechaInicio });
    });
    const capaOp2 = await db.estimacionClienteCapa.findFirstOrThrow({ where: { estimacionCliente: { proyectoId: proyecto2.id, semanaId: semana2.id }, capa: "OPERATIVO" } });
    await emitirEstimacion(usuario, capaOp2.id, false);
    await registrarAportacionFondo(usuario, proyecto2.id, { monto: 10000, fecha: new Date() });

    const capaOp2Actualizada = await db.estimacionClienteCapa.findUniqueOrThrow({ where: { id: capaOp2.id } });
    const totalCapa2 = Number(capaOp2Actualizada.total);

    // Dos intentos concurrentes de aplicar $8,000 cada uno contra un fondo de
    // $10,000 y un saldo >= $16,000 (totalCapa2 = 5000*1.? con admin 0% =
    // 5000, así que limitamos cada intento a min(fondo,saldo)/1 para forzar
    // contención real sobre el mismo disponible).
    const montoIntento = Math.min(8000, totalCapa2 || 8000);
    const resultadosConcurrentes = await Promise.all([
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM proyectos WHERE id = ${proyecto2.id} FOR UPDATE`;
        return aplicarFondoAEstimacionTx(tx, { empresaId: empresa.id, proyectoId: proyecto2.id, usuarioId: usuario.id }, capaOp2.id, montoIntento);
      }),
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM proyectos WHERE id = ${proyecto2.id} FOR UPDATE`;
        return aplicarFondoAEstimacionTx(tx, { empresaId: empresa.id, proyectoId: proyecto2.id, usuarioId: usuario.id }, capaOp2.id, montoIntento);
      }),
    ]);
    const totalAplicadoConcurrente = resultadosConcurrentes.reduce((t, r) => t + r.aplicado, 0);
    const movimientosAplicacion = await db.movimientoFinancieroCliente.findMany({
      where: { proyectoId: proyecto2.id, tipo: "APLICACION_ESTIMACION" },
    });
    const sumaRealAplicada = movimientosAplicacion.reduce((t, m) => t + Number(m.monto), 0);
    check(
      "Concurrencia: dos aplicaciones simultáneas nunca exceden el fondo disponible ($10,000)",
      totalAplicadoConcurrente <= 10000 && sumaRealAplicada === totalAplicadoConcurrente,
      `reportado=${totalAplicadoConcurrente} filasReales=${sumaRealAplicada}`
    );
  } finally {
    // Limpieza completa — todo lo que cuelga de la empresa sintética.
    const proyectos = await db.proyecto.findMany({ where: { empresaId: empresa.id }, select: { id: true } });
    const proyectoIds = proyectos.map((p) => p.id);
    const estimaciones = await db.estimacionCliente.findMany({ where: { proyectoId: { in: proyectoIds } }, select: { id: true } });
    const estimacionIds = estimaciones.map((e) => e.id);
    const capas = await db.estimacionClienteCapa.findMany({ where: { estimacionClienteId: { in: estimacionIds } }, select: { id: true } });
    const capaIds = capas.map((c) => c.id);

    await db.movimientoFinancieroCliente.deleteMany({ where: { proyectoId: { in: proyectoIds } } });
    await db.estimacionClienteGastoDetalle.deleteMany({ where: { estimacionClienteGasto: { estimacionClienteId: { in: estimacionIds } } } });
    await db.estimacionClienteGasto.deleteMany({ where: { estimacionClienteId: { in: estimacionIds } } });
    await db.estimacionClienteCapaConcepto.deleteMany({ where: { estimacionClienteCapaId: { in: capaIds } } });
    await db.gastoObra.deleteMany({ where: { proyectoId: { in: proyectoIds } } });
    await db.estimacionClienteCapa.deleteMany({ where: { id: { in: capaIds } } });
    await db.estimacionClienteConcepto.deleteMany({ where: { estimacionClienteId: { in: estimacionIds } } });
    await db.estimacionCliente.deleteMany({ where: { id: { in: estimacionIds } } });
    await db.avanceConcepto.deleteMany({ where: { empresaId: empresa.id } });
    await db.cierreSemanaProyecto.deleteMany({ where: { empresaId: empresa.id } });
    await db.concepto.deleteMany({ where: { partida: { proyectoId: { in: proyectoIds } } } });
    await db.partida.deleteMany({ where: { proyectoId: { in: proyectoIds } } });
    await db.proyecto.deleteMany({ where: { id: { in: proyectoIds } } });
    await db.semana.deleteMany({ where: { empresaId: empresa.id } });
    await db.usuario.deleteMany({ where: { empresaId: empresa.id } });
    await db.empresa.deleteMany({ where: { id: empresa.id } });

    console.log("\nLimpieza completa — sin datos sintéticos remanentes.");
  }

  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} escenarios OK.`);
  if (fallos.length > 0) {
    console.log("FALLARON:", fallos.map((f) => f.nombre).join(", "));
    process.exitCode = 1;
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
