-- Compras / Requisiciones / Cotizaciones (septiembre 2026) — Requisición =
-- la necesidad, Cotización = una opción comercial de un proveedor, Orden de
-- Compra = la decisión formal. Cada etapa referencia a la anterior, nunca la
-- vuelve a capturar.

-- CreateEnum
CREATE TYPE "PrioridadRequisicion" AS ENUM ('NORMAL', 'URGENTE');

-- CreateEnum
CREATE TYPE "EstatusRequisicion" AS ENUM ('PENDIENTE', 'EN_COTIZACION', 'CONVERTIDA', 'RECHAZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstatusRecepcionOrdenCompra" AS ENUM ('PENDIENTE', 'PARCIAL', 'COMPLETA');

-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "comentarioRecepcion" TEXT,
ADD COLUMN     "estatusRecepcion" "EstatusRecepcionOrdenCompra" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "evidenciaRecepcionNombre" TEXT,
ADD COLUMN     "evidenciaRecepcionRef" TEXT,
ADD COLUMN     "recibidoEn" TIMESTAMP(3),
ADD COLUMN     "recibidoPorId" TEXT,
ADD COLUMN     "requisicionId" TEXT;

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "clabe" TEXT,
ADD COLUMN     "razonSocial" TEXT;

-- CreateTable
CREATE TABLE "requisiciones" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "solicitantePorId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "unidad" TEXT NOT NULL,
    "prioridad" "PrioridadRequisicion" NOT NULL DEFAULT 'NORMAL',
    "fechaRequerida" TIMESTAMP(3),
    "comentarios" TEXT,
    "conceptoContractualId" TEXT,
    "evidenciaRef" TEXT,
    "evidenciaNombre" TEXT,
    "estatus" "EstatusRequisicion" NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" TEXT,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requisiciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" TEXT NOT NULL,
    "requisicionId" TEXT NOT NULL,
    "proveedorBeneficiarioId" TEXT NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "tiempoEntregaDias" INTEGER,
    "observaciones" TEXT,
    "archivoRef" TEXT,
    "archivoNombre" TEXT,
    "seleccionada" BOOLEAN NOT NULL DEFAULT false,
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requisiciones_empresaId_proyectoId_idx" ON "requisiciones"("empresaId", "proyectoId");

-- CreateIndex
CREATE INDEX "requisiciones_estatus_idx" ON "requisiciones"("estatus");

-- CreateIndex
CREATE INDEX "cotizaciones_requisicionId_idx" ON "cotizaciones"("requisicionId");

-- CreateIndex
CREATE INDEX "cotizaciones_proveedorBeneficiarioId_idx" ON "cotizaciones"("proveedorBeneficiarioId");

-- Garantiza a nivel de base de datos que a lo más UNA cotización por
-- Requisición puede estar seleccionada — no solo un checkbox visual (mismo
-- patrón que proyectos_oficina_unico_por_empresa/reposiciones abiertas, no
-- representable como @@unique en el DSL de Prisma).
CREATE UNIQUE INDEX "cotizaciones_seleccionada_unica_por_requisicion" ON "cotizaciones" ("requisicionId") WHERE "seleccionada" = true;

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_requisicionId_key" ON "ordenes_compra"("requisicionId");

-- AddForeignKey
ALTER TABLE "requisiciones" ADD CONSTRAINT "requisiciones_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisiciones" ADD CONSTRAINT "requisiciones_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisiciones" ADD CONSTRAINT "requisiciones_solicitantePorId_fkey" FOREIGN KEY ("solicitantePorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisiciones" ADD CONSTRAINT "requisiciones_conceptoContractualId_fkey" FOREIGN KEY ("conceptoContractualId") REFERENCES "conceptos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisiciones" ADD CONSTRAINT "requisiciones_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_requisicionId_fkey" FOREIGN KEY ("requisicionId") REFERENCES "requisiciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_proveedorBeneficiarioId_fkey" FOREIGN KEY ("proveedorBeneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_requisicionId_fkey" FOREIGN KEY ("requisicionId") REFERENCES "requisiciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_recibidoPorId_fkey" FOREIGN KEY ("recibidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
