-- CreateEnum
CREATE TYPE "EsquemaFinanciamientoCliente" AS ENUM ('FONDO', 'PAGO_POR_ESTIMACION');

-- CreateEnum
CREATE TYPE "TipoMovimientoFinancieroCliente" AS ENUM ('APORTACION_FONDO', 'PAGO_ESTIMACION', 'APLICACION_ESTIMACION');

-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "esquemaFinanciamientoCliente" "EsquemaFinanciamientoCliente";

-- CreateTable
CREATE TABLE "movimientos_financieros_cliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "tipo" "TipoMovimientoFinancieroCliente" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "referencia" TEXT,
    "notas" TEXT,
    "estimacionClienteId" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_financieros_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_financieros_cliente_proyectoId_idx" ON "movimientos_financieros_cliente"("proyectoId");

-- CreateIndex
CREATE INDEX "movimientos_financieros_cliente_estimacionClienteId_idx" ON "movimientos_financieros_cliente"("estimacionClienteId");

-- CreateIndex
-- Índice único PARCIAL — garantiza que una misma EstimacionCliente nunca
-- pueda tener más de un movimiento APLICACION_ESTIMACION, incluso con
-- requests concurrentes/retries, sin limitar cuántos PAGO_ESTIMACION puede
-- tener (no cubiertos por este índice). No representable en schema.prisma
-- (Prisma no soporta @@unique(..., where: ...) todavía) — vive solo aquí.
CREATE UNIQUE INDEX "movimientos_financieros_cliente_aplicacion_unica"
  ON "movimientos_financieros_cliente" ("estimacionClienteId")
  WHERE "tipo" = 'APLICACION_ESTIMACION';

-- AddForeignKey
ALTER TABLE "movimientos_financieros_cliente" ADD CONSTRAINT "movimientos_financieros_cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros_cliente" ADD CONSTRAINT "movimientos_financieros_cliente_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros_cliente" ADD CONSTRAINT "movimientos_financieros_cliente_estimacionClienteId_fkey" FOREIGN KEY ("estimacionClienteId") REFERENCES "estimaciones_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros_cliente" ADD CONSTRAINT "movimientos_financieros_cliente_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
