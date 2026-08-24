-- CreateEnum
CREATE TYPE "OrigenMovimientoSemanal" AS ENUM ('CORTE_CONTRATISTA', 'REPOSICION_GASTOS', 'ORDEN_COMPRA', 'MANUAL');

-- CreateEnum
CREATE TYPE "EstatusGasto" AS ENUM ('BORRADOR', 'PENDIENTE_REVISION', 'APROBADO', 'RECHAZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MetodoPagoGasto" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO');

-- CreateEnum
CREATE TYPE "TratamientoClienteGasto" AS ENUM ('INCLUIDO_EN_CONTRATO', 'COBRABLE_EN_ESTIMACION', 'NO_COBRABLE');

-- CreateEnum
CREATE TYPE "EstatusReposicion" AS ENUM ('BORRADOR', 'ENVIADA_REVISION', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstatusOrdenCompra" AS ENUM ('BORRADOR', 'PENDIENTE_AUTORIZACION', 'AUTORIZADA', 'RECHAZADA', 'CANCELADA');

-- DropIndex
DROP INDEX "movimientos_semanales_beneficiarioProyectoId_semanaId_key";

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "ultimoFolioOrdenCompra" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimoFolioReposicion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: origen se agrega NULLABLE primero — todas las filas existentes
-- (el único writer de este modelo hasta hoy es Cierre Semanal) se rellenan a
-- CORTE_CONTRATISTA, y SOLO ENTONCES se vuelve NOT NULL. Nunca se pierde
-- información ni se inventa un valor para filas que no sean de corte.
ALTER TABLE "movimientos_semanales" ADD COLUMN     "origen" "OrigenMovimientoSemanal";
UPDATE "movimientos_semanales" SET "origen" = 'CORTE_CONTRATISTA' WHERE "origen" IS NULL;
ALTER TABLE "movimientos_semanales" ALTER COLUMN "origen" SET NOT NULL;

-- CreateTable
CREATE TABLE "gastos_obra" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "semanaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "metodoPago" "MetodoPagoGasto" NOT NULL,
    "pagadorBeneficiarioId" TEXT,
    "proveedorBeneficiarioId" TEXT,
    "comentario" TEXT,
    "requiereFactura" BOOLEAN NOT NULL DEFAULT false,
    "facturaUrl" TEXT,
    "facturaNombre" TEXT,
    "tratamientoCliente" "TratamientoClienteGasto" NOT NULL DEFAULT 'NO_COBRABLE',
    "incluidoEnEstimacionClienteId" TEXT,
    "ticketUrl" TEXT,
    "ticketNombre" TEXT,
    "ordenCompraId" TEXT,
    "estatus" "EstatusGasto" NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "capturadoPorId" TEXT NOT NULL,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "reposicionGastosId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reposiciones_gastos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "semanaId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "numeroFolio" INTEGER NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "estatus" "EstatusReposicion" NOT NULL DEFAULT 'BORRADOR',
    "creadoPorId" TEXT NOT NULL,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "movimientoSemanalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reposiciones_gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_compra" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "semanaId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "numeroFolio" INTEGER NOT NULL,
    "proveedorBeneficiarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "estatus" "EstatusOrdenCompra" NOT NULL DEFAULT 'PENDIENTE_AUTORIZACION',
    "metodoPago" "MetodoPagoGasto",
    "requiereFactura" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "totalAutorizado" DECIMAL(14,2),
    "tratamientoCliente" "TratamientoClienteGasto" NOT NULL DEFAULT 'NO_COBRABLE',
    "incluidoEnEstimacionClienteId" TEXT,
    "cotizacionUrl" TEXT,
    "cotizacionNombre" TEXT,
    "comprobantePagoUrl" TEXT,
    "comprobantePagoNombre" TEXT,
    "facturaUrl" TEXT,
    "facturaNombre" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "autorizadoPorId" TEXT,
    "autorizadoEn" TIMESTAMP(3),
    "movimientoSemanalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_compra_conceptos" (
    "id" TEXT NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "unidad" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "precioUnitario" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ordenes_compra_conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gastos_obra_proyectoId_semanaId_idx" ON "gastos_obra"("proyectoId", "semanaId");

-- CreateIndex
CREATE INDEX "gastos_obra_pagadorBeneficiarioId_idx" ON "gastos_obra"("pagadorBeneficiarioId");

-- CreateIndex
CREATE INDEX "gastos_obra_reposicionGastosId_idx" ON "gastos_obra"("reposicionGastosId");

-- CreateIndex
CREATE UNIQUE INDEX "reposiciones_gastos_movimientoSemanalId_key" ON "reposiciones_gastos"("movimientoSemanalId");

-- CreateIndex
CREATE UNIQUE INDEX "reposiciones_gastos_proyectoId_semanaId_beneficiarioId_key" ON "reposiciones_gastos"("proyectoId", "semanaId", "beneficiarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_movimientoSemanalId_key" ON "ordenes_compra"("movimientoSemanalId");

-- CreateIndex
CREATE INDEX "ordenes_compra_conceptos_ordenCompraId_idx" ON "ordenes_compra_conceptos"("ordenCompraId");

-- CreateIndex (después del backfill de origen, ahora que ninguna fila tiene NULL)
CREATE UNIQUE INDEX "movimientos_semanales_beneficiarioProyectoId_semanaId_orige_key" ON "movimientos_semanales"("beneficiarioProyectoId", "semanaId", "origen");

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "semanas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_pagadorBeneficiarioId_fkey" FOREIGN KEY ("pagadorBeneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_proveedorBeneficiarioId_fkey" FOREIGN KEY ("proveedorBeneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "ordenes_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_capturadoPorId_fkey" FOREIGN KEY ("capturadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_reposicionGastosId_fkey" FOREIGN KEY ("reposicionGastosId") REFERENCES "reposiciones_gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposiciones_gastos" ADD CONSTRAINT "reposiciones_gastos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposiciones_gastos" ADD CONSTRAINT "reposiciones_gastos_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposiciones_gastos" ADD CONSTRAINT "reposiciones_gastos_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "semanas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposiciones_gastos" ADD CONSTRAINT "reposiciones_gastos_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposiciones_gastos" ADD CONSTRAINT "reposiciones_gastos_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposiciones_gastos" ADD CONSTRAINT "reposiciones_gastos_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposiciones_gastos" ADD CONSTRAINT "reposiciones_gastos_movimientoSemanalId_fkey" FOREIGN KEY ("movimientoSemanalId") REFERENCES "movimientos_semanales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "semanas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proveedorBeneficiarioId_fkey" FOREIGN KEY ("proveedorBeneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_movimientoSemanalId_fkey" FOREIGN KEY ("movimientoSemanalId") REFERENCES "movimientos_semanales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra_conceptos" ADD CONSTRAINT "ordenes_compra_conceptos_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
