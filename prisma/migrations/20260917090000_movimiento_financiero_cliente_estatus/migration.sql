-- Cobros de cliente / Cuentas por cobrar (septiembre 2026) — nunca se borra
-- un cobro/aportación real, se cancela (mismo criterio que
-- Egreso/Ingreso/Factura/ReposicionGastos). Todo movimiento existente queda
-- VIGENTE por default (backfill implícito del DEFAULT).

-- AlterTable
ALTER TABLE "movimientos_financieros_cliente" ADD COLUMN     "canceladoEn" TIMESTAMP(3),
ADD COLUMN     "canceladoPorId" TEXT,
ADD COLUMN     "estatus" "EstatusRegistroContable" NOT NULL DEFAULT 'VIGENTE',
ADD COLUMN     "motivoCancelacion" TEXT;

-- AddForeignKey
ALTER TABLE "movimientos_financieros_cliente" ADD CONSTRAINT "movimientos_financieros_cliente_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
