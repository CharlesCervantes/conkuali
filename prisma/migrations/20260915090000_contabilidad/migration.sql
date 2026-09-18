-- CreateEnum
CREATE TYPE "TipoMedioFinanciero" AS ENUM ('BANCO', 'TARJETA', 'EFECTIVO');

-- CreateEnum
CREATE TYPE "MetodoIngreso" AS ENUM ('TRANSFERENCIA', 'DEPOSITO', 'CHEQUE', 'OTRO');

-- CreateEnum
CREATE TYPE "EstatusRegistroContable" AS ENUM ('VIGENTE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "DireccionFactura" AS ENUM ('EMITIDA', 'RECIBIDA');

-- CreateTable
CREATE TABLE "medios_financieros" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoMedioFinanciero" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medios_financieros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "direccion" "DireccionFactura" NOT NULL,
    "xmlRef" TEXT NOT NULL,
    "xmlNombre" TEXT NOT NULL,
    "pdfRef" TEXT,
    "pdfNombre" TEXT,
    "uuid" TEXT NOT NULL,
    "rfcEmisor" TEXT NOT NULL,
    "razonSocialEmisor" TEXT NOT NULL,
    "rfcReceptor" TEXT NOT NULL,
    "razonSocialReceptor" TEXT,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "totalImpuestos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "moneda" TEXT NOT NULL,
    "metodoPago" TEXT,
    "formaPago" TEXT,
    "serie" TEXT,
    "folio" TEXT,
    "estatus" "EstatusRegistroContable" NOT NULL DEFAULT 'VIGENTE',
    "subidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "egresos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "gastoObraId" TEXT,
    "fecha" TIMESTAMP(3),
    "concepto" TEXT,
    "monto" DECIMAL(14,2),
    "proyectoId" TEXT,
    "medioFinancieroId" TEXT,
    "facturaId" TEXT,
    "notasContables" TEXT,
    "estatus" "EstatusRegistroContable" NOT NULL DEFAULT 'VIGENTE',
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "egresos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "movimientoFinancieroClienteId" TEXT,
    "fecha" TIMESTAMP(3),
    "proyectoId" TEXT,
    "monto" DECIMAL(14,2),
    "concepto" TEXT,
    "clienteNombre" TEXT,
    "metodoIngreso" "MetodoIngreso",
    "cuentaReceptoraId" TEXT,
    "referencia" TEXT,
    "comprobanteRef" TEXT,
    "comprobanteNombre" TEXT,
    "facturaId" TEXT,
    "facturaEsperada" BOOLEAN NOT NULL DEFAULT false,
    "comentarios" TEXT,
    "estatus" "EstatusRegistroContable" NOT NULL DEFAULT 'VIGENTE',
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingresos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medios_financieros_empresaId_idx" ON "medios_financieros"("empresaId");

-- CreateIndex
CREATE INDEX "facturas_empresaId_idx" ON "facturas"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_empresaId_uuid_key" ON "facturas"("empresaId", "uuid");

-- CreateIndex
CREATE UNIQUE INDEX "egresos_gastoObraId_key" ON "egresos"("gastoObraId");

-- CreateIndex
CREATE INDEX "egresos_empresaId_idx" ON "egresos"("empresaId");

-- CreateIndex
CREATE INDEX "egresos_facturaId_idx" ON "egresos"("facturaId");

-- CreateIndex
CREATE INDEX "egresos_medioFinancieroId_idx" ON "egresos"("medioFinancieroId");

-- CreateIndex
CREATE UNIQUE INDEX "ingresos_movimientoFinancieroClienteId_key" ON "ingresos"("movimientoFinancieroClienteId");

-- CreateIndex
CREATE INDEX "ingresos_empresaId_idx" ON "ingresos"("empresaId");

-- CreateIndex
CREATE INDEX "ingresos_facturaId_idx" ON "ingresos"("facturaId");

-- AddForeignKey
ALTER TABLE "medios_financieros" ADD CONSTRAINT "medios_financieros_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_gastoObraId_fkey" FOREIGN KEY ("gastoObraId") REFERENCES "gastos_obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_medioFinancieroId_fkey" FOREIGN KEY ("medioFinancieroId") REFERENCES "medios_financieros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "facturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_movimientoFinancieroClienteId_fkey" FOREIGN KEY ("movimientoFinancieroClienteId") REFERENCES "movimientos_financieros_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_cuentaReceptoraId_fkey" FOREIGN KEY ("cuentaReceptoraId") REFERENCES "medios_financieros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "facturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Catálogo: nuevo módulo global "Contabilidad" (Contabilidad, septiembre
-- 2026) — mismo patrón que el módulo "gastos". Insertar el catálogo NUNCA
-- otorga acceso por sí solo: el acceso real se resuelve por Empresa vía
-- Plan+EmpresaModulo (empresaTieneModulo).
INSERT INTO "modulos" ("id", "clave", "nombre")
VALUES ('modulo_contabilidad', 'contabilidad', 'Contabilidad')
ON CONFLICT ("clave") DO NOTHING;

-- Backfill: habilita el módulo "contabilidad" ÚNICAMENTE para la Empresa
-- Grupo Conkuali (id = 'conkuali', su llave primaria real — mismo
-- identificador ya usado en los backfills de privadoHabilitado,
-- reciboLeyenda y el módulo "gastos" de esta sesión, nunca un match por
-- nombre). Override explícito de EmpresaModulo (habilitado = true) — el
-- mecanismo general de módulos por Empresa sigue siendo 100% configurable
-- desde Portal Master para cualquier otra Empresa, existente o futura;
-- ninguna otra Empresa recibe este módulo por este backfill.
INSERT INTO "empresa_modulos" ("empresaId", "moduloId", "habilitado")
SELECT 'conkuali', m."id", true
FROM "modulos" m
WHERE m."clave" = 'contabilidad'
  AND EXISTS (SELECT 1 FROM "empresas" WHERE "id" = 'conkuali')
ON CONFLICT ("empresaId", "moduloId") DO UPDATE SET "habilitado" = true;
