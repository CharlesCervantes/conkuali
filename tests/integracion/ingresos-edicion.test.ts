import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/server/db";
import { editarIngresoManual, guardarDecoracionIngreso } from "@/lib/server/contabilidad/ingresos";
import { obtenerSaldosMediosFinancieros } from "@/lib/server/contabilidad/saldos";
import {
  CAMPOS_DECORACION_INGRESO,
  CAMPOS_INGRESO_MANUAL,
  decoracionIngresoDesdeFormulario,
  ingresoManualDesdeFormulario,
  prefijoOriginal,
} from "@/lib/contabilidad/formulario-ingreso";
import { usuarioDePrueba } from "../helpers/usuarios";
import {
  EMPRESA,
  MEDIO_AJENO,
  MEDIO_BANCO,
  PROYECTO,
  SEMANA,
  admin,
  adminAjeno,
  baseLimpiaConDatos,
  conFallaSimulada,
  repetir,
  sinInterbloqueos,
} from "./apoyo/base";

// Corrección de pérdida de datos en Ingresos contra PostgreSQL REAL (base
// local dedicada, verificada por tests/setup/integracion.mjs): contrato
// parcial, efecto real sobre los saldos de Bancos, fecha de cobro histórica
// exacta, concurrencia con FOR UPDATE real, rollback real, privacidad (D-a) y
// multiempresa. Datos ficticios.

const MEDIO_B = "medio-banco-b";
const adminSinPrivado = usuarioDePrueba({ rol: "ADMINISTRADOR", empresaId: EMPRESA, vistaPrivadaActiva: false });
const FECHA_COBRO_HISTORICA = new Date(Date.UTC(2026, 9, 5, 17, 45, 30, 123));

after(() => db.$disconnect());
beforeEach(async () => {
  await baseLimpiaConDatos();
  await db.medioFinanciero.create({ data: { id: MEDIO_B, empresaId: EMPRESA, nombre: "Banco B ficticio", tipo: "BANCO" } });
});

async function cobro(id: string, monto: string, capaPrivada = false) {
  let estimacionClienteCapaId: string | null = null;
  if (capaPrivada) {
    const estimacion = await db.estimacionCliente.create({ data: { empresaId: EMPRESA, proyectoId: PROYECTO, semanaId: SEMANA, generadoPorId: admin.id } });
    const capa = await db.estimacionClienteCapa.create({ data: { estimacionClienteId: estimacion.id, capa: "PRIVADO", generadoPorId: admin.id } });
    estimacionClienteCapaId = capa.id;
  }
  return db.movimientoFinancieroCliente.create({
    data: {
      id,
      empresaId: EMPRESA,
      proyectoId: PROYECTO,
      tipo: "PAGO_ESTIMACION",
      monto,
      fecha: new Date(Date.UTC(2026, 9, 6)),
      referencia: "SPEI-COBRO-1",
      registradoPorId: admin.id,
      estimacionClienteCapaId,
    },
  });
}

async function saldo(medioId: string): Promise<number | null> {
  const { medios } = await obtenerSaldosMediosFinancieros(admin);
  return medios.find((m) => m.id === medioId)?.saldoActual ?? null;
}

// Mismo FormData que arma ingresos-view.tsx con el registro actual de la BD.
async function formularioDesdeBd(campos: readonly string[], ingresoId: string, cambios: Record<string, string> = {}, casilla?: boolean) {
  const i = await db.ingreso.findUniqueOrThrow({ where: { id: ingresoId } });
  const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const actuales: Record<string, string> = {
    clienteNombre: i.clienteNombre ?? "",
    metodoIngreso: i.metodoIngreso ?? "",
    cuentaReceptoraId: i.cuentaReceptoraId ?? "",
    facturaId: i.facturaId ?? "",
    comentarios: i.comentarios ?? "",
    fecha: dia(i.fecha),
    concepto: i.concepto ?? "",
    monto: i.monto === null ? "" : String(Number(i.monto)),
    proyectoId: i.proyectoId ?? "",
    clasificacionManual: i.clasificacionManual ?? "",
    fechaCobro: dia(i.fechaCobro),
    referencia: i.referencia ?? "",
  };
  const fd = new FormData();
  for (const campo of campos) {
    fd.set(prefijoOriginal(campo), actuales[campo]);
    fd.set(campo, cambios[campo] ?? actuales[campo]);
  }
  fd.set(prefijoOriginal("facturaEsperada"), i.facturaEsperada ? "true" : "false");
  if (casilla ?? i.facturaEsperada) fd.set("facturaEsperada", "on");
  return fd;
}
const ingresoDeCobro = (movimientoId: string) => db.ingreso.findUniqueOrThrow({ where: { movimientoFinancieroClienteId: movimientoId } });

describe("Ingresos en PostgreSQL — decoración de un pago de cliente", () => {
  test("Editar solo comentarios conserva la cuenta y el saldo; cambiar la cuenta mueve el saldo", async () => {
    await cobro("cobro-1", "10000.00");
    await guardarDecoracionIngreso(admin, "cobro-1", { cuentaReceptoraId: MEDIO_BANCO, comentarios: "Primer registro", facturaEsperada: true });
    assert.equal(await saldo(MEDIO_BANCO), 10000);

    const { id } = await ingresoDeCobro("cobro-1");
    await guardarDecoracionIngreso(admin, "cobro-1", decoracionIngresoDesdeFormulario(await formularioDesdeBd(CAMPOS_DECORACION_INGRESO, id, { comentarios: "Solo comentario" })));
    const tras = await ingresoDeCobro("cobro-1");
    assert.equal(tras.cuentaReceptoraId, MEDIO_BANCO);
    assert.equal(tras.facturaEsperada, true);
    assert.equal(tras.comentarios, "Solo comentario");
    assert.equal(await saldo(MEDIO_BANCO), 10000, "el saldo no cambia si no se toca la cuenta");

    await guardarDecoracionIngreso(admin, "cobro-1", decoracionIngresoDesdeFormulario(await formularioDesdeBd(CAMPOS_DECORACION_INGRESO, id, { cuentaReceptoraId: MEDIO_B })));
    assert.equal(await saldo(MEDIO_BANCO), 0);
    assert.equal(await saldo(MEDIO_B), 10000);
    const auditorias = await db.registroAuditoria.findMany({ where: { entidad: "Ingreso", entidadId: id }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(auditorias.at(-1)!.valorAnterior, { cuentaReceptoraId: MEDIO_BANCO });
  });

  test("Ediciones simultáneas de campos distintos no se pisan", async () => {
    await cobro("cobro-1", "500.00");
    await guardarDecoracionIngreso(admin, "cobro-1", { cuentaReceptoraId: MEDIO_BANCO });
    await repetir(5, async (vuelta) => {
      const r = await Promise.allSettled([
        guardarDecoracionIngreso(admin, "cobro-1", { comentarios: `Comentario ${vuelta}` }),
        guardarDecoracionIngreso(admin, "cobro-1", { clienteNombre: `Cliente ${vuelta}` }),
      ]);
      sinInterbloqueos(r);
      assert.ok(r.every((x) => x.status === "fulfilled"), JSON.stringify(r));
      const i = await ingresoDeCobro("cobro-1");
      assert.equal(i.comentarios, `Comentario ${vuelta}`);
      assert.equal(i.clienteNombre, `Cliente ${vuelta}`);
      assert.equal(i.cuentaReceptoraId, MEDIO_BANCO);
    });
    assert.equal(await db.ingreso.count({ where: { movimientoFinancieroClienteId: "cobro-1" } }), 1);
  });

  test("Primera decoración simultánea: un solo Ingreso", async () => {
    await cobro("cobro-1", "500.00");
    const r = await Promise.allSettled([
      guardarDecoracionIngreso(admin, "cobro-1", { comentarios: "A" }),
      guardarDecoracionIngreso(admin, "cobro-1", { clienteNombre: "B" }),
    ]);
    sinInterbloqueos(r);
    assert.ok(r.every((x) => x.status === "fulfilled"), JSON.stringify(r));
    const i = await ingresoDeCobro("cobro-1");
    assert.deepEqual([i.comentarios, i.clienteNombre], ["A", "B"]);
  });

  test("Rollback real: si falla la auditoría, la decoración no cambia", async () => {
    await cobro("cobro-1", "500.00");
    await guardarDecoracionIngreso(admin, "cobro-1", { cuentaReceptoraId: MEDIO_BANCO, comentarios: "Original" });
    await conFallaSimulada("registros_auditoria", "TRUE", () =>
      assert.rejects(guardarDecoracionIngreso(admin, "cobro-1", { comentarios: "No debe quedar", cuentaReceptoraId: MEDIO_B }), /Falla simulada/)
    );
    const i = await ingresoDeCobro("cobro-1");
    assert.deepEqual([i.comentarios, i.cuentaReceptoraId], ["Original", MEDIO_BANCO]);
    assert.equal(await saldo(MEDIO_B), 0);
  });

  test("Privacidad (D-a): sin permiso privado un cobro PRIVADO no existe; con permiso sí se decora", async () => {
    await cobro("cobro-privado", "700.00", true);
    await assert.rejects(guardarDecoracionIngreso(adminSinPrivado, "cobro-privado", { comentarios: "x" }), /no encontr|no existe/i);
    assert.equal(await db.ingreso.count(), 0);
    await guardarDecoracionIngreso(admin, "cobro-privado", { comentarios: "Con permiso" });
    assert.equal((await ingresoDeCobro("cobro-privado")).comentarios, "Con permiso");
  });

  test("Multiempresa: otra Empresa no decora; una cuenta ajena se rechaza", async () => {
    await cobro("cobro-1", "500.00");
    await assert.rejects(guardarDecoracionIngreso(adminAjeno, "cobro-1", { comentarios: "intrusa" }), /no encontr|no existe/i);
    await assert.rejects(guardarDecoracionIngreso(admin, "cobro-1", { cuentaReceptoraId: MEDIO_AJENO }));
    assert.equal(await db.ingreso.count(), 0);
  });
});

describe("Ingresos en PostgreSQL — edición de un ingreso manual", () => {
  async function manual() {
    return db.ingreso.create({
      data: {
        empresaId: EMPRESA,
        fecha: new Date(Date.UTC(2026, 9, 1, 12)),
        concepto: "Venta de material sobrante",
        monto: "1500.00",
        proyectoId: PROYECTO,
        cuentaReceptoraId: MEDIO_BANCO,
        referencia: "DEP-77",
        comentarios: "Comentario previo",
        facturaEsperada: true,
        fechaCobro: FECHA_COBRO_HISTORICA,
        clasificacionManual: "INGRESO_OPERATIVO",
        registradoPorId: admin.id,
      },
    });
  }

  test("Editar solo el concepto conserva todo, con la fecha de cobro exacta (hasta milisegundos)", async () => {
    const { id } = await manual();
    await editarIngresoManual(admin, id, ingresoManualDesdeFormulario(await formularioDesdeBd(CAMPOS_INGRESO_MANUAL, id, { concepto: "Corregido" })));
    const i = await db.ingreso.findUniqueOrThrow({ where: { id } });
    assert.equal(i.concepto, "Corregido");
    assert.equal(i.fechaCobro?.getTime(), FECHA_COBRO_HISTORICA.getTime());
    assert.deepEqual(
      [i.proyectoId, i.cuentaReceptoraId, i.referencia, i.comentarios, i.facturaEsperada, i.clasificacionManual, Number(i.monto)],
      [PROYECTO, MEDIO_BANCO, "DEP-77", "Comentario previo", true, "INGRESO_OPERATIVO", 1500]
    );
    assert.equal(await saldo(MEDIO_BANCO), 1500);
  });

  test("Vaciar la fecha de cobro lo saca del saldo; volver a ponerla lo regresa", async () => {
    const { id } = await manual();
    assert.equal(await saldo(MEDIO_BANCO), 1500);
    await editarIngresoManual(admin, id, ingresoManualDesdeFormulario(await formularioDesdeBd(CAMPOS_INGRESO_MANUAL, id, { fechaCobro: "" })));
    assert.equal(await saldo(MEDIO_BANCO), 0);
    await editarIngresoManual(admin, id, ingresoManualDesdeFormulario(await formularioDesdeBd(CAMPOS_INGRESO_MANUAL, id, { fechaCobro: "2026-10-09" })));
    assert.equal(await saldo(MEDIO_BANCO), 1500);
  });

  test("Ediciones simultáneas de campos distintos no se pisan", async () => {
    const { id } = await manual();
    await repetir(5, async (vuelta) => {
      const r = await Promise.allSettled([
        editarIngresoManual(admin, id, { concepto: `Concepto ${vuelta}` }),
        editarIngresoManual(admin, id, { comentarios: `Comentario ${vuelta}` }),
      ]);
      sinInterbloqueos(r);
      assert.ok(r.every((x) => x.status === "fulfilled"), JSON.stringify(r));
      const i = await db.ingreso.findUniqueOrThrow({ where: { id } });
      assert.deepEqual([i.concepto, i.comentarios], [`Concepto ${vuelta}`, `Comentario ${vuelta}`]);
    });
  });

  test("Rollback real y multiempresa", async () => {
    const { id } = await manual();
    await conFallaSimulada("registros_auditoria", "TRUE", () =>
      assert.rejects(editarIngresoManual(admin, id, { concepto: "No debe quedar" }), /Falla simulada/)
    );
    await assert.rejects(editarIngresoManual(adminAjeno, id, { concepto: "intrusa" }), /no encontr|no existe/i);
    await assert.rejects(editarIngresoManual(admin, id, { cuentaReceptoraId: MEDIO_AJENO }));
    const i = await db.ingreso.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([i.concepto, i.cuentaReceptoraId], ["Venta de material sobrante", MEDIO_BANCO]);
  });
});
